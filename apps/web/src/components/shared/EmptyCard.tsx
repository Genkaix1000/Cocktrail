export default function EmptyCard({ text }: { text: string }) {
  return (
    <div className="bg-ink-925/50 border border-dashed border-ink-800/60 rounded-xl p-6 text-center text-[13px] text-ink-400/80">
      {text}
    </div>
  );
}
