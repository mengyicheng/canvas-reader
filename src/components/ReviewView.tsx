import { useState } from "react";
import { Flashcard, Doc, findDoc } from "../types";
import { ScrollReveal } from "./effects/ScrollReveal";

export default function ReviewView({
  flashcards,
  docs,
  onRate,
  onOpenPara,
}: {
  flashcards: Flashcard[];
  docs: Doc[];
  onRate: (id: string, quality: number) => void;
  onOpenPara: (docId: string, paraId: string) => void;
}) {
  const [queue, setQueue] = useState<Flashcard[]>(() =>
    flashcards.filter((c) => c.due <= Date.now())
  );
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);

  const current = queue[idx];
  const total = flashcards.length;

  function rate(q: number) {
    if (!current) return;
    onRate(current.id, q);
    setQueue((qq) => qq.filter((c) => c.id !== current.id));
    setFlipped(false);
  }
  function reset() {
    setQueue(flashcards.filter((c) => c.due <= Date.now()));
    setIdx(0);
    setFlipped(false);
  }

  if (total === 0) {
    return (
      <div className="review-empty">
        <h2>闪卡复习</h2>
        <p>还没有闪卡。在你写边注、或选中文字点「问题/生成复习卡」时，会自动生成复习卡。</p>
      </div>
    );
  }

  if (!current) {
    return (
      <div className="review-empty">
        <h2>🎉 今日复习完成</h2>
        <p>共 {total} 张卡在库。间隔重复会按你的记忆情况自动安排下次时间。</p>
        <button className="full" onClick={reset}>再复习一轮</button>
      </div>
    );
  }

  const docTitle = findDoc(docs, current.docId)?.title || "文库";

  return (
    <div className="review">
      <div className="review-head">
        <span>复习中</span>
        <span className="muted">剩余 {queue.length} 张 · 库共 {total} 张</span>
      </div>
      <ScrollReveal>
      <div className="review-card" onClick={() => setFlipped(true)}>
        <div className="review-doc">{docTitle}</div>
        <div className="review-front">{current.front}</div>
        {flipped && <div className="review-back">{current.back}</div>}
        {!flipped && <div className="review-hint">点击卡片显示答案</div>}
      </div>
      </ScrollReveal>
      {flipped ? (
        <div className="review-rate">
          <button className="rate again" onClick={() => rate(0)}>重来</button>
          <button className="rate hard" onClick={() => rate(3)}>困难</button>
          <button className="rate good" onClick={() => rate(4)}>良好</button>
          <button className="rate easy" onClick={() => rate(5)}>简单</button>
        </div>
      ) : (
        <button className="full" onClick={() => setFlipped(true)}>显示答案</button>
      )}
      <button className="ghost full review-open" onClick={() => onOpenPara(current.docId, current.paraId)}>
        回到原文
      </button>
    </div>
  );
}
