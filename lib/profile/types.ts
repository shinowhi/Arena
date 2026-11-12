import { z } from "zod";

// Learner profile (P1): who the user is, picked once at /start.
// Stored in localStorage (see ./storage.ts); server sync arrives with accounts (P5/P6).

export const Segment = z.enum(["grade12", "uni1"]);
export type Segment = z.infer<typeof Segment>;

export const TargetExam = z.enum(["vact", "hsa", "thpt", "none"]);
export type TargetExam = z.infer<typeof TargetExam>;

export const SubjectId = z.enum(["toan", "ly", "hoa", "anh"]);
export type SubjectId = z.infer<typeof SubjectId>;

export const LevelSelf = z.enum(["lost", "shaky", "solid"]);
export type LevelSelf = z.infer<typeof LevelSelf>;

export const LearnerProfile = z.object({
  version: z.literal(1),
  segment: Segment,
  targetExam: TargetExam,
  subjects: z.array(SubjectId).min(1).max(4),
  levelSelf: LevelSelf,
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});
export type LearnerProfile = z.infer<typeof LearnerProfile>;

export const SEGMENT_LABEL: Record<Segment, string> = {
  grade12: "Học sinh lớp 12",
  uni1: "Sinh viên năm 1",
};

export const TARGET_EXAM_LABEL: Record<TargetExam, string> = {
  vact: "Thi V-ACT",
  hsa: "Thi HSA",
  thpt: "Thi tốt nghiệp THPT",
  none: "Chỉ học chắc kiến thức",
};

export const SUBJECT_LABEL: Record<SubjectId, string> = {
  toan: "Toán",
  ly: "Vật lý",
  hoa: "Hóa học",
  anh: "Tiếng Anh",
};

export const LEVEL_LABEL: Record<LevelSelf, string> = {
  lost: "Mất gốc, cần vá từ đầu",
  shaky: "Lủng vài chỗ",
  solid: "Khá rồi, muốn chắc hơn",
};