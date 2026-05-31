/**
 * تحليل صيانة + سكور المبنى الشهري.
 * الربط مع قاعدة البيانات: `supervisorMonthlyScore` يكتب إلى `BuildingHealthScore` بحسب عدد الطلبات فقط، دون اعتماد `status`.
 * الربط مع خدمة خارجية اختيارية: `fetchExternalMaintenanceMl` (MAINTENANCE_ML_API_URL في البيئة).
 */
import { fetchExternalMaintenanceMl } from "./ml-inference";
import type { FailureClass } from "./maintenance-predictor";
import {
  issueLabel,
  predictFailure,
  recommendServices,
  textToFeatures,
} from "./maintenance-predictor";
import { prisma } from "./prisma";

const KEYWORDS: { k: string[]; labels: string[] }[] = [
  { k: ["مصعد", "مصاعد", "elevator", "lift"], labels: ["مصاعد", "كهرباء عامة"] },
  { k: ["سباكة", "تسريب", "ماء", "plumb"], labels: ["سباكة", "عزل مائي"] },
  { k: ["تكييف", "مكيف", "hvac"], labels: ["تكييف وتهوية"] },
  { k: ["كهرباء", "electr", "إنارة"], labels: ["كهرباء منزلية"] },
  { k: ["دهان", "بوية", "طلاء"], labels: ["دهانات وديكور"] },
];

function classify(description: string) {
  const d = description.toLowerCase();
  const hits: string[] = [];
  for (const row of KEYWORDS) {
    if (row.k.some((w) => d.includes(w.toLowerCase()))) hits.push(...row.labels);
  }
  return Array.from(new Set(hits));
}

/** نافذة زمنية تقريبية + حد أقصى للأيام — لعرضها مع نتيجة النموذج (ليس تنبيهاً منفصلاً). */
function maintenanceHorizon(issue: FailureClass): { ar: string; maxDays: number } {
  switch (issue) {
    case "Water_Leakage":
      return {
        ar: "يُفضّل معالجة تسريب/رطوبة خلال أسبوع إلى ثلاثة أسابيع حسب الشدة.",
        maxDays: 21,
      };
    case "Electrical_Issue":
      return {
        ar: "مراجعة كهربائية خلال أيام قليلة إلى أسبوعين لتقليل مخاطر التماس.",
        maxDays: 14,
      };
    case "Roof_Leakage":
      return {
        ar: "بعد الأمطار أو بقع السقف: جدولة عزل/فحص خلال أسبوعين إلى شهر.",
        maxDays: 30,
      };
    case "Wall_Crack":
      return {
        ar: "متابعة وتقييم هندسي خلال شهر إلى شهرين حسب اتساع الشق.",
        maxDays: 60,
      };
    case "Drainage_Blockage":
      return { ar: "معالجة انسداد الصرف خلال أيام إلى أسبوع.", maxDays: 10 };
    default:
      return {
        ar: "راجع التقدّم أسبوعياً وحدّد موعداً مناسباً للكشف حسب التطوّر.",
        maxDays: 90,
      };
  }
}

/** دمج مقترحات شركة من المصدر المحلي والخادم الخارجي (بدون ازدواجية اسم الشركة بنفس الاسم). */
function mergeCompanies(
  ...lists: ({ company: string; rating: number }[] | undefined)[]
): { company: string; rating: number }[] {
  const byName = new Map<string, number>();
  for (const list of lists) {
    if (!list?.length) continue;
    for (const row of list) {
      const n = row.company.trim();
      if (!n) continue;
      const prev = byName.get(n);
      if (prev === undefined || row.rating > prev) byName.set(n, row.rating);
    }
  }
  return Array.from(byName.entries())
    .map(([company, rating]) => ({ company, rating }))
    .sort((a, b) => b.rating - a.rating);
}

function localModelInsight(description: string, city: string) {
  const features = textToFeatures(description, city);
  const issue = predictFailure(features);
  const label = issueLabel(issue, "ar");
  const horizon = maintenanceHorizon(issue);
  const horizonBlock = `تقدير زمني للصيانة: ${horizon.ar} الحد الأقصى المقترح للانتظار قبل التدخل: نحو ${horizon.maxDays} يوماً.`;
  const recRows = recommendServices(issue, 5);
  const companies = recRows.map((r) => ({ company: r.company, rating: r.rating }));

  if (issue === "No_Issue") {
    return {
      issue,
      summary: `${horizonBlock}\n\nلم يُستخلص عطل واضح من الوصف الحالي (التصنيف: ${label}).`,
      suggestions:
        "لو وُجدت أعراض إضافية، يرجى توضيحها (ماء، كهرباء، جدران، صرف، سقف) للحصول على توصية أدق. للصيانة المجتمعية يمكن فتح تصويت على شركات مقترحة بعد الإرسال.",
      tag: label,
      companies,
    };
  }
  return {
    issue,
    summary: `${horizonBlock}\n\nتوقّع التصنيف: ${label}.`,
    suggestions:
      "يُستفاد من التصنيف أعلاه لجدولة المعاينة والمتابعة؛ للبلاغ المجتمعي يمكن للسكان تصويت ترشيحات شركة الصيانة من التطبيق.",
    tag: label,
    companies,
  };
}

export type MaintenanceAiResult = {
  summary: string;
  suggestions: string;
  tags: string[];
  /** مقترحات لخيارات تصويت أعطال مجتمعية + عرض مساعد على البطاقة */
  companies: { company: string; rating: number }[];
};

export async function analyzeMaintenance(options: {
  description: string;
  city: string;
  buildingId?: string;
}): Promise<MaintenanceAiResult> {
  const ext = await fetchExternalMaintenanceMl({
    description: options.description,
    city: options.city,
    buildingId: options.buildingId,
  });
  const local = localModelInsight(options.description, options.city);
  let tags = classify(options.description);
  if (local.tag) tags.push(local.tag);
  if (ext?.tags?.length) {
    tags = Array.from(new Set([...tags, ...ext.tags]));
  }
  tags = Array.from(new Set(tags));

  const localSummary = local.summary;
  const summary = ext?.summary?.trim()
    ? `${ext.summary.trim()}\n\n${localSummary}`
    : localSummary;

  const localSuggestions = local.suggestions;
  const mergedSuggestions =
    localSuggestions +
    (ext?.suggestions?.trim() ? `\n\n——\n${ext.suggestions.trim()}` : "");

  const companies = mergeCompanies(ext?.companies, local.companies).slice(0, 8);

  return {
    summary,
    suggestions: mergedSuggestions,
    tags,
    companies,
  };
}

function monthKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export async function supervisorMonthlyScore(buildingId: string) {
  const requests = await prisma.maintenanceRequest.findMany({
    where: { buildingId },
  });
  /** لا تمييز بين طلب «مكتمل» و«مفتوح»؛ يُعتدّ بعدد الطلبات المسجّلة فقط. */
  const n = requests.length;
  const score = Math.max(
    0,
    Math.min(100, Math.round(88 - Math.min(n, 35))),
  );
  const summary =
    n === 0
      ? "لا توجد طلبات صيانة مسجّلة في هذا الشهر؛ تُعتمد درجة الأساس المرجعية."
      : `يُحتسب السكّور اعتمادًا على ${n} طلبًا مسجلًا هذا الشهر.`;
  await prisma.buildingHealthScore.upsert({
    where: {
      buildingId_month: { buildingId, month: monthKey() },
    },
    create: { buildingId, month: monthKey(), score, summary },
    update: { score, summary },
  });
  return { month: monthKey(), score, summary };
}
