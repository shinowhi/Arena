"use client";

// Root error boundary: replaces the whole page (even the layout), so it must
// render its own <html>/<body> and cannot rely on layout CSS — inline styles only.
export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <html lang="vi">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#08080f",
          color: "#f4f4f5",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          padding: 16,
        }}
      >
        <main style={{ maxWidth: 480, textAlign: "center" }}>
          <p
            style={{
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "#f87171",
              margin: 0,
            }}
          >
            Ứng dụng bị choáng
          </p>
          <h1 style={{ fontSize: 28, fontWeight: 800, margin: "8px 0 0" }}>
            Có lỗi nghiêm trọng
          </h1>
          <p style={{ fontSize: 14, color: "#a1a1aa", lineHeight: 1.6 }}>
            BossLearn gặp lỗi không gỡ được. Thử vẽ lại trang — tiến độ đã lưu
            của bạn vẫn còn nguyên. Nếu vẫn lỗi, về đấu trường.
          </p>
          <div style={{ marginTop: 8, display: "flex", gap: 12, justifyContent: "center" }}>
            <button
              type="button"
              onClick={reset}
              style={{
                minHeight: 48,
                border: 0,
                borderRadius: 9999,
                padding: "10px 28px",
                fontSize: 14,
                fontWeight: 700,
                color: "#fff",
                background: "linear-gradient(180deg, #ef4444, #b91c1c)",
                cursor: "pointer",
              }}
            >
              Thử lại
            </button>
            <a
              href="/arena"
              style={{
                display: "inline-flex",
                alignItems: "center",
                minHeight: 48,
                borderRadius: 9999,
                padding: "10px 28px",
                fontSize: 14,
                fontWeight: 700,
                color: "#e4e4e7",
                border: "1px solid #3f3f46",
                textDecoration: "none",
              }}
            >
              Về đấu trường
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
