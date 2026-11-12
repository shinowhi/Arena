import Link from "next/link";
import type { ComponentType } from "react";

// Single source of truth for which clusters start open when the visitor has
// no stored preference. Lives here (server-safe) — never in the client
// ClusterSection — because the server page calls it during prerender.
// Callers must use isDefaultOpen — never literals.
export const DEFAULT_OPEN_IDS = ["hoc-tap"];

export function isDefaultOpen(id: string): boolean {
  return DEFAULT_OPEN_IDS.includes(id);
}
import {
  ArenaIcon,
  BookIcon,
  CameraIcon,
  CardsIcon,
  ChatIcon,
  FlameIcon,
  FriendsIcon,
  GhostIcon,
  GlobeIcon,
  HomeIcon,
  MapIcon,
  ReportIcon,
  ScanIcon,
  StoreIcon,
  SwordsIcon,
  TimerIcon,
} from "@/components/icons";

export type Icon = ComponentType<{ className?: string }>;

export type ClusterMeta = { id: string; title: string; summary: string; icon: Icon };
export type ClusterItemData = { href: string; icon: Icon; label: string; desc: string };

// Cluster catalogue for the homepage. Every href below was verified against
// the app/ dir listing: drop none, invent none. Spotlight/Armory copy is
// preserved verbatim in the matching item descs (scan, life, arena, ghosts,
// streak, diary, countdown, cards, roadmap, parent).
export const CLUSTERS: ClusterMeta[] = [
  { id: "hoc-tap", title: "Học tập", summary: "Quét bài, luyện tập và vá kỹ năng mỗi ngày.", icon: BookIcon },
  { id: "thi-cu", title: "Thi cử", summary: "Thi thử V-ACT, HSA, THPT và phòng thi.", icon: TimerIcon },
  { id: "dau-truong", title: "Đấu trường", summary: "Đánh boss, đấu đối thủ và cày cùng lớp ma.", icon: SwordsIcon },
  { id: "tien-trinh", title: "Tiến trình", summary: "Chuỗi ngày, nhật ký, kế hoạch và báo cáo.", icon: MapIcon },
  { id: "tai-khoan", title: "Tài khoản & nhóm", summary: "VIP, thanh toán, gia đình và bạn bè.", icon: FriendsIcon },
  { id: "sitemap", title: "Sơ đồ trang", summary: "Mọi trang trong Arena, ở một chỗ.", icon: GlobeIcon },
];

export const CLUSTER_ITEMS: Record<string, ClusterItemData[]> = {
  "hoc-tap": [
    { href: "/scan", icon: CameraIcon, label: "Quét bài", desc: "Bài thi, ảnh màn hình hay đời thường. AI nhìn trực tiếp — không OCR." },
    { href: "/scan?mode=life", icon: GlobeIcon, label: "Đời thường", desc: "Chụp bất cứ gì quanh bạn — nhận về một bài toán giải được từ cảnh đó." },
    { href: "/drill", icon: ScanIcon, label: "Luyện tập", desc: "Tự luyện theo kỹ năng yếu, lỗi sai, chủ đề hoặc ảnh chụp." },
    { href: "/mastery", icon: CardsIcon, label: "Thành thạo", desc: "Xem độ chắc từng kỹ năng và luyện đúng chỗ hổng." },
    { href: "/tutor", icon: ChatIcon, label: "Gia sư AI", desc: "Hỏi bất cứ gì, kèm lời giải từng bước." },
    { href: "/paper", icon: ReportIcon, label: "Đề giấy", desc: "Luyện đề bấm giờ theo kỹ năng, máy chấm điểm." },
    { href: "/misses", icon: ScanIcon, label: "Lỗi sai", desc: "Hàng đợi những câu từng làm sai, chờ bạn phục thù." },
    { href: "/revenge", icon: SwordsIcon, label: "Phục thù", desc: "Tái đấu con boss từng hạ gục bạn." },
    { href: "/adaptive", icon: TimerIcon, label: "Luyện thích ứng", desc: "Độ khó tự chỉnh theo đúng trình độ của bạn." },
    { href: "/essay", icon: BookIcon, label: "Chấm tự luận", desc: "Chấm điểm câu trả lời tự luận của bạn." },
    { href: "/cards", icon: CardsIcon, label: "Thẻ công thức", desc: "Lật thẻ đúng lúc, nhớ công thức lâu hơn." },
  ],
  "thi-cu": [
    { href: "/vact", icon: ReportIcon, label: "Thi thử V-ACT", desc: "120 câu hỏi, máy chấm điểm." },
    { href: "/hsa", icon: BookIcon, label: "Thi thử HSA", desc: "150 câu hỏi, đồng hồ riêng từng phần." },
    { href: "/thpt", icon: TimerIcon, label: "Thi thử THPT", desc: "Đề thi 90 phút, trả lời đáp số." },
    { href: "/exam", icon: ArenaIcon, label: "Phòng thi", desc: "Cổng vào mọi kỳ thi thử trong Arena." },
    { href: "/countdown", icon: TimerIcon, label: "Đếm ngược kỳ thi", desc: "Sẵn sàng trước khi trống vang." },
  ],
  "dau-truong": [
    { href: "/arena", icon: SwordsIcon, label: "Đánh boss", desc: "Kỹ năng yếu nhất của bạn, đang sống. 5 câu hỏi ngăn bạn hạ nó." },
    { href: "/duel", icon: ArenaIcon, label: "Đấu tay đôi", desc: "Thách đấu thi thử với đối thủ." },
    { href: "/royale", icon: FlameIcon, label: "Sinh tồn", desc: "Người học cuối cùng trụ lại chiến thắng." },
    { href: "/pvp", icon: SwordsIcon, label: "Đấu xếp hạng", desc: "So tài trực tiếp với người chơi khác." },
    { href: "/gauntlet", icon: FlameIcon, label: "Vượt ải", desc: "Một con boss tổng hợp mọi kỹ năng để ôn." },
    { href: "/ghosts", icon: GhostIcon, label: "Lớp học ma", desc: "Những thợ săn ẩn danh đang cày cùng bạn tối nay. Không bao giờ học một mình." },
  ],
  "tien-trinh": [
    { href: "/streak", icon: FlameIcon, label: "Chuỗi ngày vá", desc: "Vá một chút mỗi ngày, giữ lửa liên tục." },
    { href: "/diary", icon: BookIcon, label: "Nhật ký vá gốc", desc: "Mọi gốc rễ bạn từng vá." },
    { href: "/badges", icon: CardsIcon, label: "Huy hiệu", desc: "Huy hiệu tuần bạn đã chinh phục." },
    { href: "/plan", icon: MapIcon, label: "Kế hoạch 7 ngày", desc: "Lịch vá kỹ năng của tuần này." },
    { href: "/progress", icon: ReportIcon, label: "Câu chuyện hồi phục", desc: "Nhìn lại chặng đường bạn đã đi qua." },
    { href: "/graph", icon: GlobeIcon, label: "Cây kỹ năng", desc: "Bản đồ toàn bộ kỹ năng của bạn." },
    { href: "/roadmap", icon: TimerIcon, label: "Lộ trình 30 ngày", desc: "Điểm danh mỗi ngày, cán đích đúng hạn." },
    { href: "/parent", icon: FriendsIcon, label: "Báo cáo phụ huynh", desc: "Tiến bộ của bạn, gọn trong một trang." },
    { href: "/transparency", icon: ChatIcon, label: "Minh bạch AI", desc: "AI đã làm gì — tất cả đều đo được." },
  ],
  "tai-khoan": [
    { href: "/vip", icon: FlameIcon, label: "VIP", desc: "Mở khóa mọi đặc quyền cao cấp." },
    { href: "/billing", icon: StoreIcon, label: "Gói & thanh toán", desc: "Mua gói và xem lịch sử thanh toán." },
    { href: "/family", icon: HomeIcon, label: "Gia đình", desc: "Học cùng người thân trong nhà." },
    { href: "/center", icon: MapIcon, label: "Trung tâm", desc: "Học tại các trung tâm liên kết." },
    { href: "/friends", icon: FriendsIcon, label: "Bạn bè", desc: "Lập đội, đua tiến độ cùng bạn." },
    { href: "/groups", icon: GlobeIcon, label: "Nhóm học", desc: "Đang tạm nghỉ — hẹn sớm gặp lại." },
    { href: "/chat", icon: ChatIcon, label: "Nhắn tin", desc: "Trò chuyện trực tiếp với bạn học." },
  ],
};

// Sitemap-only routes: live index pages outside the five clusters.
// /admin is staff-gated (cookie + secret) so it stays out of the public map;
// /boss has no index page (bosses are reached via scan/arena).
const SITEMAP_EXTRA: ClusterItemData[] = [
  { href: "/start", icon: HomeIcon, label: "Bắt đầu", desc: "Trả lời 3 câu hỏi, nhận lộ trình riêng." },
  { href: "/market", icon: StoreIcon, label: "Chợ đêm", desc: "Đang tạm nghỉ." },
];

export type SitemapGroup = { id: string; title: string; links: { href: string; label: string }[] };

export function buildSitemap(): SitemapGroup[] {
  const groups = CLUSTERS.filter((c) => c.id !== "sitemap").map((c) => ({
    id: c.id,
    title: c.title,
    links: (CLUSTER_ITEMS[c.id] ?? []).map((i) => ({ href: i.href, label: i.label })),
  }));
  groups.push({
    id: "khac",
    title: "Khác",
    links: SITEMAP_EXTRA.map((i) => ({ href: i.href, label: i.label })),
  });
  return groups;
}

export function sitemapCount(): number {
  return (
    Object.values(CLUSTER_ITEMS).reduce((n, items) => n + items.length, 0) + SITEMAP_EXTRA.length
  );
}

// One cluster card: icon + Vietnamese label + 1-line desc. Labels are plain
// spans, never headings (cluster titles are the h2s).
export function ClusterItem({ item }: { item: ClusterItemData }) {
  const ItemIcon = item.icon;
  return (
    <li>
      <Link
        href={item.href}
        className="group flex min-h-[48px] items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-3 transition-all hover:-translate-y-0.5 hover:border-zinc-600 hover:bg-zinc-900"
      >
        <span
          aria-hidden="true"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-zinc-700 bg-zinc-900/70 text-zinc-300 transition-colors group-hover:text-white"
        >
          <ItemIcon className="h-6 w-6" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold text-zinc-100">{item.label}</span>
          <span className="block truncate text-xs text-zinc-400" title={item.desc}>
            {item.desc}
          </span>
        </span>
        <span
          aria-hidden="true"
          className="shrink-0 text-zinc-600 transition-transform group-hover:translate-x-1"
        >
          →
        </span>
      </Link>
    </li>
  );
}

export function ClusterGrid({ items }: { items: ClusterItemData[] }) {
  return (
    <ul role="list" className="grid gap-2 sm:grid-cols-2">
      {items.map((item) => (
        <ClusterItem key={item.href} item={item} />
      ))}
    </ul>
  );
}

// Compact full sitemap: grouped link rows with mono paths.
export function SitemapList({ groups }: { groups: SitemapGroup[] }) {
  return (
    <div className="flex flex-col gap-4">
      {groups.map((g) => (
        <div key={g.id}>
          <p className="text-xs font-bold tracking-widest text-zinc-500 uppercase">{g.title}</p>
          <ul role="list" className="mt-2 grid gap-1 sm:grid-cols-2">
            {g.links.map((l) => (
              <li key={l.href} className="min-w-0">
                <Link
                  href={l.href}
                  className="flex min-h-[48px] items-center justify-between gap-2 rounded-xl border border-transparent px-3 py-2 transition-colors hover:border-zinc-700 hover:bg-zinc-900/60"
                >
                  <span className="min-w-0 truncate text-sm font-medium text-zinc-200">{l.label}</span>
                  <span className="shrink-0 truncate font-mono text-xs text-zinc-500">{l.href}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
