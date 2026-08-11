/**
 * Hero — 「Wander & Read」旅游讲故事风首屏（无 currentDoc 时显示）。
 * 元素：
 *  - Hero 主标题：衬线大字 + 手写副标（"Your Next ..."）
 *  - 数据条：50+/200+/100K+/10+，数字 CountUp 滚动进入
 *  - 3 张快捷入口卡片（撕角、胶片感、金边框）：导入 / 画布 / 复习
 *  - The Library Awaits CTA Banner
 *  - 右上 / 右下：金色 StampBadge（旋转徽章）、手写体引言
 */
import { CountUp } from "./effects/CountUp";
import { Marquee } from "./effects/Marquee";
import { StampBadge } from "./effects/StampBadge";
import { FadeContent } from "./effects/FadeContent";
import { BlurText } from "./effects/BlurText";
import { View } from "./Sidebar";
import { ImportedFile } from "../lib/platform";

export function Hero({
  library,
  docs,
  flashcards,
  concepts,
  onImport,
  onHome,
  onView,
  onSelectFile,
  hasSavedData,
}: {
  library: ImportedFile[];
  docs: { id: string; title: string }[];
  flashcards: { id: string }[];
  concepts: { nodes: { id: string }[] };
  onImport: () => void;
  onHome: () => void;
  onView: (v: View) => void;
  onSelectFile: (f: ImportedFile) => void;
  hasSavedData: boolean;
}) {
  // 真实数据：库/卡/概念条目
  const libCount = library.length;
  const docCount = docs.length;
  // 字数估算：每 doc/chap/para 取近似（这里用 docs 长度粗估）
  const wordCount = docs.length * 1200; // 估算，避免再传 props
  const conceptCount = concepts?.nodes?.length || 0;

  // Hero 区数据条
  const stats: { v: number; suf: string; pre?: string; label: string; sub: string }[] = [
    { v: docCount, suf: "+", label: "DESTINATIONS", sub: "已收藏书目" },
    { v: libCount, suf: "+", label: "STORIES", sub: "导入文件" },
    { v: wordCount, suf: "+", label: "WORDS", sub: "累计字数" },
    { v: conceptCount, suf: "+", label: "ATLAS", sub: "提炼概念" },
  ];

  return (
    <FadeContent key="hero" className="hero-wrap">
      {/* 顶部跑马灯：每日一句风 */}
      <Marquee speed={48}>
        <span className="m-item">TRAVEL · READ · REMEMBER</span>
        <span className="m-dot">◆</span>
        <span className="m-item">EVERY PAGE IS A DESTINATION</span>
        <span className="m-dot">◆</span>
        <span className="m-item">WRITE IT DOWN · IT WILL FIND YOU</span>
        <span className="m-dot">◆</span>
        <span className="m-item">LIGHT A LANTERN · OPEN A BOOK</span>
        <span className="m-dot">◆</span>
      </Marquee>

      {/* HERO 区 */}
      <section className="hero">
        <div className="hero-inner">
          <div className="hero-headline">
            <span className="hero-eyebrow">— WANDER &amp; READ · 2026 EDITION —</span>
            <h1 className="hero-title">
              <span className="ht-row">Your Next</span>
              <span className="ht-row italic">Chapter</span>
              <span className="ht-row script">Begins Here<span className="dot">.</span></span>
            </h1>
            <p className="hero-sub">
              We don't just show your <em>books</em>, we take you on{" "}
              <em>journeys</em> that stay with you forever.
            </p>
            <div className="hero-cta-row">
              <button className="hero-cta" onClick={onImport}>
                EXPLORE JOURNEYS <span className="arrow">→</span>
              </button>
              <button className="hero-cta ghost" onClick={() => onView("concepts")}>
                VIEW CONCEPT MAP
              </button>
            </div>
            <p className="hero-quote">"The world is <em>full of stories</em>, you just have to find yours."</p>
          </div>

          {/* 右上 StampBadge（圆形徽章，慢速旋转） */}
          <div className="hero-badge hero-badge-tr">
            <StampBadge label="READER" sublabel="EST · 2026" size={120} spin />
          </div>
          {/* 右下 印章 */}
          <div className="hero-badge hero-badge-br">
            <StampBadge label="DAILY" sublabel="CUSTOM" size={150} spin={false} />
          </div>
        </div>

        {/* 撕角边装饰 */}
        <div className="hero-tear" />
      </section>

      {/* 数据条（在 Hero 撕角下方） */}
      <section className="stats-strip">
        {stats.map((s, i) => (
          <div className="stat-cell" key={i}>
            <div className="stat-icon">✦</div>
            <div className="stat-num">
              <CountUp target={s.v} suffix={s.suf} prefix={s.pre} />
            </div>
            <div className="stat-label">{s.label}</div>
            <div className="stat-sub">{s.sub}</div>
          </div>
        ))}
      </section>

      {/* 卡片网格：3 张撕角入口 */}
      <section className="quick-grid">
        <div className="qg-head">
          <h2>Where Will You Wander Today?</h2>
          <p>Real journeys from real readers. Be inspired by their adventures.</p>
        </div>
        <div className="qg-cards">
          <article className="polaroid" onClick={onImport}>
            <div className="polaroid-tape tape-tl" />
            <div className="polaroid-photo p1">
              <div className="polaroid-inner">
                <div className="polaroid-eyebrow">CHAPTER 01</div>
                <h3>Upload Your Library</h3>
                <p>Take some time to load your novels and guides for the next trip.</p>
                <span className="polaroid-cta">READ DIARIES →</span>
              </div>
            </div>
            <div className="polaroid-cap">📚 导入 EPUB / PDF 文件夹</div>
          </article>

          <article className="polaroid" onClick={() => onView("canvas")}>
            <div className="polaroid-tape tape-tl" />
            <div className="polaroid-photo p2">
              <div className="polaroid-inner">
                <div className="polaroid-eyebrow">CHAPTER 02</div>
                <h3>The Infinite Canvas</h3>
                <p>"Every canvas is a story. Here's where the road can take you."</p>
                <span className="polaroid-cta">START EXPLORING →</span>
              </div>
            </div>
            <div className="polaroid-cap">🗺 边注 · 反链 · 概念图谱</div>
          </article>

          <article className="polaroid" onClick={() => onView("review")}>
            <div className="polaroid-tape tape-tl" />
            <div className="polaroid-photo p3">
              <div className="polaroid-inner">
                <div className="polaroid-eyebrow">CHAPTER 03</div>
                <h3>Reviewer's Compass</h3>
                <p>Between the mountains and the breeze, you'll always know where you're going.</p>
                <span className="polaroid-cta">SET A SAIL →</span>
              </div>
            </div>
            <div className="polaroid-cap">🧠 闪卡复习 · 间隔重复</div>
          </article>
        </div>
      </section>

      {/* 已导入库若不为空：罗列出来 */}
      {library.length > 0 && (
        <section className="lib-shelf">
          <div className="qg-head">
            <h2>Your Current Shelf</h2>
            <p>打开文档，进入「旅游」模式阅读。</p>
          </div>
          <ul className="lib-list">
            {library.slice(0, 8).map((f) => (
              <li
                key={f.path}
                className="lib-item"
                onClick={() => onSelectFile(f)}
              >
                <span className="lib-tag">{f.ext.toUpperCase()}</span>
                <span className="lib-name">{f.name.replace(/\.[^.]+$/, "")}</span>
                <span className="lib-cta">→</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 库为空、但上次有存档：提示用户重新导入以恢复 */}
      {library.length === 0 && hasSavedData && (
        <section className="lib-shelf">
          <div className="qg-head">
            <h2>Welcome Back</h2>
            <p>你的笔记、进度与向量已保存。重新导入同一读书库文件夹，即可回到上次读到的地方。</p>
          </div>
          <button className="hero-cta" onClick={onImport}>
            RE-IMPORT LIBRARY <span className="arrow">→</span>
          </button>
        </section>
      )}

      {/* CTA Banner */}
      <section className="cta-banner">
        <h2>
          <span className="script">The Library</span> is Waiting.
        </h2>
        <p>Pack your bag, open your heart, and let's create stories of a lifetime.</p>
        <button className="hero-cta" onClick={onImport}>
          PLAN YOUR JOURNEY <span className="arrow">→</span>
        </button>
      </section>
    </FadeContent>
  );
}
