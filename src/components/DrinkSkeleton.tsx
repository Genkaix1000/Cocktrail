export default function DrinkSkeleton() {
  return (
    <div className="group relative flex items-center justify-between p-4 rounded-2xl bg-[#0f172a]/50 border border-[#1e293b] animate-pulse">
      <div className="flex flex-col gap-1 pr-4 w-full">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-[18px] h-[18px] rounded-full bg-[#1e293b]"></div>
          <div className="h-5 bg-[#1e293b] rounded-md w-3/4"></div>
        </div>
        <div className="flex flex-col gap-2 mt-1">
          <div className="h-3 bg-[#1e293b] rounded-md w-full"></div>
          <div className="h-3 bg-[#1e293b] rounded-md w-4/5"></div>
        </div>
        <div className="h-5 bg-[#1e293b] rounded-md w-1/4 mt-2"></div>
      </div>
      
      <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-[#1e293b]"></div>
    </div>
  );
}