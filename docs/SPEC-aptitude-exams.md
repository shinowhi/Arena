# SPEC: 2 đề thi năng lực (V-ACT, HSA) — full nhiều môn

Trạng thái: USER ĐÃ DUYỆT (9/11) — V-SAT bỏ. Đang implement.

## 1. Mục tiêu

2 trang thi riêng (`/vact`, `/hsa`), cấu trúc + số câu + giờ giống đề thật.
Trắc nghiệm 4 lựa chọn, đáp án đúng không bao giờ gửi xuống trình duyệt.

## 2. Cấu trúc chốt (đã duyệt)

### V-ACT (= ĐGNL ĐHQG-HCM, APT form 2025)

Nguồn: đề tham khảo APT 2025, video chữa đề V-ACT 2026 (Toán 30 câu).

- 120 câu, 150 phút, 1 đồng hồ chung. Thang /1200 (10đ/câu).
- P1 Ngôn ngữ 60: Việt 30 (1-30), Anh 30 (31-60).
- P2 Toán 30 (61-90). P3 Tư duy KH 30: Logic+số liệu 12, Suy luận KH 18.

### HSA (ĐGNL ĐHQG Hà Nội 2025)

Nguồn: thông báo chính thức ussh.vnu.edu.vn.

- 150 câu, thang /150 (1đ/câu). Đồng hồ RIÊNG từng phần, làm tuần tự.
- P1 Toán + xử lý số liệu: 50 câu / 75 phút.
- P2 Văn + ngôn ngữ: 50 câu / 60 phút.
- P3 tự chọn Khoa học HOẶC Tiếng Anh: 50 câu / 60 phút.

## 3. Mô hình chất lượng 2 tầng

- Tầng V (Verified): Toán + định lượng — verify đáp án bằng máy (mathjs).
- Tầng A (AI draft): các môn còn lại — pipeline kỹ (mục 4), gắn nhãn
  "AI draft" + nút báo câu sai.

## 4. Pipeline sinh đề (chậm mà chắc, tái sinh mỗi 2 ngày)

Đề KHÔNG sinh theo từng user. Job `prime-exam-cache` chạy mỗi 2 ngày,
sinh + kiểm kỹ rồi mới đưa vào cache; user chỉ đọc cache (0 LLM lúc thi).

- Toán: sinh câu số → LLM tạo 3 đáp án nhiễu → máy kiểm: đáp án đúng
  khớp check, nhiễu ≠ đáp án (theo tolerance), 4 options đôi một khác nhau.
- Môn khác (3 lớp kiểm):
  1. Sinh câu + 4 options + đáp án + giải thích (schema zod).
  2. Chấm chéo độc lập: xáo options, LLM trả lời lại — phải trùng đáp án.
  3. Kiểm luật: đúng 4 options phân biệt, đáp án trong 0-3, không trùng stem.
- Rớt lớp nào → thử lại tối đa 3 lần → vẫn rớt thì ghi log, câu đó lấy từ
  đề dự phòng (cache kỳ trước) để đề luôn đủ câu.
- Đảo thứ tự options phía server; đáp án chỉ nằm ở cache server.

## 5. Kiến trúc

- `lib/agents/exam.ts`: types MC + config V-ACT/HSA + assembly + rotation
  theo epoch 2 ngày.
- `lib/agents/subject-forge.ts`: forge + verify pipeline (mục 4).
- Cache: tái dùng `boss_question_cache`, `set_version=2`, skill_tag theo
  section (`vact_math`, `hsa_literature`...). Không migration mới.
- API: `GET /api/vact/mock`, `GET /api/hsa/mock` (đọc cache, 0 LLM),
  `POST /api/exam/grade` (chấm theo option đã chọn, đối chiếu cache server).
- Trang: `/vact` (1 đồng hồ + tabs phần), `/hsa` (chọn P3 + tuần tự + khóa phần).

## 6. Test + gates

- `test-exam.mjs`: counts, clock, rotation 2 ngày, grade đúng/sai.
- Gates: lint 0 lỗi, tsc sạch, build xanh, full suite xanh, live mock + chấm.
