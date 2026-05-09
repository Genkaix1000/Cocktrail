'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, ChevronLeft, Receipt, Clock, CreditCard, CheckCircle } from 'lucide-react';

interface OrderItem {
  name: string;
  qty: number;
  subtotal: number;
}

interface OrderData {
  id: string;
  items: OrderItem[];
  total: number;
  pickupCode: string;
  timestamp: number;
  status: 'pendiente' | 'entregado';
}

export default function TicketPage() {
  const [orders, setOrders] = useState<OrderData[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [time, setTime] = useState<Date | null>(null);
  const router = useRouter();

  useEffect(() => {
    const data = localStorage.getItem('cocktrail_orders');
    if (data) {
      try {
        const parsed = JSON.parse(data) as OrderData[];
        // Filtra órdenes de las últimas 6 horas
        const valid = parsed.filter(o => Date.now() - o.timestamp < 6 * 3600 * 1000);
        // Ordena para que las más recientes queden arriba
        valid.sort((a, b) => b.timestamp - a.timestamp);
        setOrders(valid);
        if (valid.length !== parsed.length) localStorage.setItem('cocktrail_orders', JSON.stringify(valid));
      } catch (e) {}
    }
    setIsLoaded(true);

    // Reloj para evitar capturas de pantalla falsas
    setTime(new Date());
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []); // <--- El array vacío detiene el error de recargas entre renders

  const markAsDelivered = (id: string) => {
    const updated = orders.map(o => o.id === id ? { ...o, status: 'entregado' as const } : o);
    setOrders(updated);
    localStorage.setItem('cocktrail_orders', JSON.stringify(updated));
  };

  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-[#020617] flex items-center justify-center text-white">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <Receipt size={32} className="text-[#1e293b]" />
          <p className="text-slate-500 font-mono text-sm uppercase tracking-widest">Cargando tickets...</p>
        </div>
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <main className="min-h-screen bg-[#020617] text-white p-5 flex flex-col items-center justify-center">
        <Receipt size={48} className="text-[#1e293b] mb-4" />
        <h2 className="text-xl font-bold mb-2">No tienes pedidos</h2>
        <p className="text-slate-500 text-sm mb-8 text-center max-w-[250px]">Tus pedidos activos o recientes (últimas 6 horas) aparecerán aquí.</p>
        <button 
          onClick={() => router.push('/')}
          className="bg-[#38bdf8] text-[#020617] px-6 py-3 rounded-xl font-bold active:scale-95 transition-transform"
        >
          Volver al Menú
        </button>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#020617] text-white p-5 flex flex-col">
      <button 
        onClick={() => router.push('/')}
        className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors w-fit mb-4 mt-2"
      >
        <ChevronLeft size={20} />
        <span className="text-sm font-semibold uppercase tracking-wider">Volver al Menú</span>
      </button>

      <div className="flex-1 max-w-md w-full mx-auto flex flex-col gap-8 pb-10">
        <div className="flex items-center gap-3 pl-2">
          <Receipt size={24} className="text-[#38bdf8]" />
          <h1 className="text-2xl font-black tracking-tight text-white leading-none mt-1">Mis Pedidos</h1>
        </div>

        {orders.map((order) => (
          <div key={order.id} className={`bg-[#0f172a] border border-[#1e293b] rounded-3xl p-8 relative overflow-hidden shadow-2xl flex flex-col transition-all ${order.status === 'entregado' ? 'grayscale opacity-60' : ''}`}>
            
            {/* Mercado Pago Badge */}
            <div className="mx-auto flex items-center gap-1.5 bg-[#10b981]/10 border border-[#10b981]/20 text-[#10b981] px-3 py-1.5 rounded-full mb-6 w-fit">
              <CheckCircle2 size={14} />
              <span className="text-[9px] font-black uppercase tracking-wider">Pago verificado por Mercado Pago</span>
            </div>

            {/* Security Clock */}
            <div className="flex flex-col items-center justify-center mb-6 bg-[#020617]/50 py-3 rounded-2xl border border-white/5">
              <div className="flex items-center gap-2 text-slate-400 mb-1">
                <Clock size={12} className="text-[#38bdf8]" />
                <span className="text-[9px] uppercase tracking-widest font-bold">Reloj de Seguridad</span>
              </div>
              <div className="font-mono text-3xl font-medium text-white tracking-widest leading-none">
                {time ? time.toLocaleTimeString('es-AR', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '--:--:--'}
              </div>
            </div>

            {/* Pickup Code (Número Grande Aleatorio) */}
            <div className="flex flex-col items-center justify-center bg-[#020617] border border-[#1e293b] rounded-2xl py-6 mb-6 shadow-inner relative overflow-hidden">
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-[0.2em] mb-2">Tu código de retiro</span>
              <span className="text-7xl font-black text-[#38bdf8] leading-none tracking-tighter">{order.pickupCode}</span>
              
              {order.status === 'entregado' && (
                <div className="absolute inset-0 flex items-center justify-center bg-[#020617]/80 backdrop-blur-sm z-10">
                  <div className="border-4 border-red-500 text-red-500 transform -rotate-12 px-6 py-2 rounded-xl text-3xl font-black tracking-widest shadow-2xl">
                    ENTREGADO
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-4 mb-6">
              {/* Summary Header con Horario Creado */}
              <div className="flex items-center justify-between text-sm pb-4 border-b border-[#1e293b]/50">
                <div className="flex items-center gap-2 text-slate-400">
                  <span className="font-mono text-xs">{new Date(order.timestamp).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit'})}</span>
                </div>
                <div className="flex items-center gap-2 text-slate-400">
                  <CreditCard size={16} className="text-[#38bdf8]/70" />
                  <span className="font-mono font-bold text-white">${order.total.toLocaleString('es-AR')}</span>
                </div>
              </div>

              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">Detalle de los tragos</h3>
              {order.items.map((item, i) => (
                <div key={i} className="flex justify-between items-center text-sm">
                  <span className="text-slate-300 font-medium line-clamp-1 pr-2">
                    <span className="text-[#38bdf8] font-mono font-bold mr-2">{item.qty}x</span> 
                    {item.name}
                  </span>
                  <span className="font-mono text-slate-400 shrink-0">${item.subtotal.toLocaleString('es-AR')}</span>
                </div>
              ))}
            </div>

            {/* Línea Divisoria Decorativa */}
            <div className="h-px border-t border-dashed border-[#1e293b] w-full mt-auto mb-4 relative">
              <div className="absolute -left-10 -top-3 w-6 h-6 bg-[#020617] rounded-full border-r border-[#1e293b]"></div>
              <div className="absolute -right-10 -top-3 w-6 h-6 bg-[#020617] rounded-full border-l border-[#1e293b]"></div>
            </div>

            {order.status === 'pendiente' && (
              <button 
                onClick={() => markAsDelivered(order.id)}
                className="w-full mt-2 h-12 bg-[#1e293b] hover:bg-[#334155] text-slate-300 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors"
              >
                Simular: Marcar como Entregado
              </button>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}
