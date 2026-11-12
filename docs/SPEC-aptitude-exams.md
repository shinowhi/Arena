# SPEC: Đề luyện thi (V-ACT, HSA, THPT) — phạm vi & ghi chú sản phẩm

Trạng thái: VIẾT LẠI ngày 12/11 theo "Ghi chú định hướng sản phẩm" và
"Khung nghiên cứu tạo đề luyện THPT và V-ACT". SPEC cũ (ghi "giống đề thật",
chấm /1200, /150, /10) đã XÓA vì vi phạm khung.

## 1. Nguyên tắc bất khả xâm phạm (từ khung nghiên cứu)

1. **Không bao giờ gọi đề luyện là đề chính thức**, không gắn mác tương đương.
2. **Điểm luyện là số câu đúng thô.** Không quy đổi ra thang điểm thi thật
   khi chưa hiệu chuẩn:
   - V-ACT thật dùng IRT, trọng số mỗi câu khác nhau, 4 thành phần 300đ
     (Tiếng Việt / Tiếng Anh / Toán / Tư duy khoa học). Cấm chấm 10đ/câu
     rồi ghi "/1200".
   - THPT và HSA cũng chỉ báo số câu đúng + disclaimer, không quy /10 hay /150.
3. Mọi trang thi và trang review phải hiện disclaimer:
   "Practice only — this score is not equivalent to the official exam."
4. Dùng **chương trình GDPT làm nguồn sự thật, đề mẫu làm nguồn format.**
   Không sao chép câu hỏi, đoạn văn, dữ liệu, đáp án từ đề thật/đề mẫu —
   mọi câu đều nguyên bản, sinh từ yêu cầu cần đạt + dạng tư duy.
5. Nhãn độ khó (Cơ bản / Vận dụng / Thử thách) là nhãn NỘI BỘ để chọn câu
   và theo dõi tiến bộ, không phải phân loại chính thức, không quy ra điểm.

## 2. Phạm vi từng đề (đúng tới đâu, sai lệch tới đâu — nói thật)

### V-ACT (ĐGNL ĐHQG-HCM, form 2025+)
- Khớp: 120 câu, 150 phút, 1 đồng hồ chung; 3 phần (Ngôn ngữ 60 =
  Việt 30 + Anh 30; Toán 30; Tư duy KH 30 = Logic–số liệu 12 + Suy luận KH 18).
- KHÔNG khớp: thang điểm (thật: IRT 4×300; ta: số câu đúng thô).
- Nguồn format: cấu trúc + đề minh họa V-ACT chính thức của ĐHQG-HCM.

### HSA (ĐGNL ĐHQG Hà Nội)
- Khớp: 150 câu, đồng hồ riêng từng phần, làm tuần tự, P3 tự chọn
  Khoa học hoặc Tiếng Anh.
- KHÔNG khớp: mọi tuyên bố về thang điểm chính thức — chỉ báo số câu đúng.
- Nguồn format: thông báo chính thức của ĐHQG Hà Nội.

### THPT (luồng Toán, trang /thpt)
- HIỆN TẠI KHÁC đề thật: ta đang chạy 50 câu numeric, trong khi đề Toán
  THPT thật là 12 chọn đáp án + 4 đúng/sai (mỗi câu 4 ý, chấm theo số ý
  đúng) + 6 trả lời ngắn = 34 lệnh hỏi, điểm 3+4+3.
- Trang /thpt PHẢI ghi rõ format khác đề chính thức. Đưa đề về đúng cấu
  trúc 12+4+6 là việc P-next (chưa có ngày), không được ngầm tuyên bố
  đã giống.

## 3. Yêu cầu cho mỗi câu hỏi (từ mục 7 khung nghiên cứu)

Mỗi item trong cache phải có (lưu trong JSON, không cần migration mới):
`exam`, `subject`, `grade`, `topic`, `learningOutcome` (yêu cầu cần đạt),
`competency`, `itemType`, `difficultyLabel` (nội bộ), `solutionSteps`,
`commonMisconception` (căn cứ cho đáp án nhiễu), `prompt`, `options`,
`answer`, `explanation`, `provenance` (căn cứ chương trình).
- Distractor phải có lý do (lỗi tính toán, nhầm khái niệm, đọc sai điều
  kiện) — cấm đáp án sai vô lý và cấm 2 phương án cùng đúng.
- Cụm câu chung stimulus: mỗi câu vẫn phải có đáp án xác định riêng.

## 4. Quy trình kiểm soát chất lượng (đang chạy + còn thiếu)

ĐANG CHẠY (giữ):
- Tầng V (Verified): Toán + định lượng — đáp án kiểm bằng máy (mathjs).
- Tầng A (AI draft): môn còn lại — 3 lớp kiểm (sinh có schema →
  chấm chéo xáo options phải trùng đáp án → kiểm luật 4 options phân biệt),
  gắn nhãn "AI draft" + nút báo câu sai.
- Cache 2 ngày (`prime-exam-cache`), user chỉ đọc cache (0 LLM lúc thi);
  đáp án không bao giờ xuống client; chấm ở server; 409 khi đề refresh
  giữa giờ.
CÒN THIẾU (theo khung, làm dần):
- Gắn `learningOutcome` + `grade/topic` thật cho từng item (hiện mới có
  skill_tag theo section).
- Rà soát môn học/ngôn ngữ/độ tuổi trước khi gắn mác "ổn định" cho bộ đề.
- Thu tỷ lệ đúng + thời gian làm bài để hiệu chỉnh nhãn độ khó nội bộ.
- Chỉ tuyên bố tương đương đề thật khi có dữ liệu hiệu chuẩn (hiện: không).

## 5. Kiến trúc (không đổi)

- `lib/agents/exam.ts`: types MC + config V-ACT/HSA + assembly + rotation
  epoch 2 ngày. Config KHÔNG chứa thang điểm (đã xóa `scale`,
  `pointsPerQ`) — điểm luôn là số câu đúng thô.
- `lib/agents/subject-forge.ts`: forge + verify pipeline (mục 4).
- Cache: `boss_question_cache`, `set_version=2`, skill_tag theo section.
- API: `GET /api/vact/mock`, `GET /api/hsa/mock` (đọc cache, 0 LLM),
  `POST /api/exam/grade` (chấm theo option đã chọn, đối chiếu cache server),
  `GET /api/exam/review` (trả key sau khi paper lock).
- Trang: `/vact`, `/hsa`, `/thpt`, `/exam/review`, hub `/exam`.

## 6. Nguồn chính thức (đối chiếu format, không copy nội dung)

- THPT: Cục Quản lý chất lượng — cấu trúc + 18 đề tham khảo 2024
  (nội dung lớp 12); chương trình GDPT 2018 + sửa đổi (lưu ý TT17/2025
  sửa Lịch sử 10, Địa lí 12, GDKT&PL 10).
- V-ACT: ĐHQG-HCM — cấu trúc 2025+, đề minh họa, FAQ cách tính điểm IRT.
- HSA: thông báo chính thức ĐHQG Hà Nội.
- Link đầy đủ trong "Khung nghiên cứu" (file ngoài repo arena).

## 7. Ngoài phạm vi (không làm, không hứa)

- Quy đổi điểm luyện ra điểm thi thật (IRT, /10, /150, /1200).
- Tuyên bố "đề bám sát / tương đương đề chính thức".
- Phủ đủ môn thi THPT (thiếu GDKT&PL, Tin học, Công nghệ — theo khung).
- Quản lý lớp cho giáo viên (để sau, theo định hướng sản phẩm).

## 8. Test + gates

- `test-exam.mjs`: counts, clock, rotation 2 ngày, grade đúng/sai,
  và assert config KHÔNG chứa thang điểm quy đổi.
- Gates: lint 0 lỗi, tsc sạch, build xanh, full suite xanh, live mock + chấm.