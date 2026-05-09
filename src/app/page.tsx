'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ShoppingBag, ArrowUpDown, Flame, Martini, Wine, DropletOff, X, Check, Plus, Minus, Receipt } from 'lucide-react';
import DrinkCard from '../components/DrinkCard';
import DrinkSkeleton from '../components/DrinkSkeleton';

const MOCK_DRINKS = [
  { id: 1, name: 'Fernet con Coca', description: 'El clásico argentino 70/30. Branca y Coca-Cola bien helada.', price: 5500, trending: true, icon: Wine, vibe: 'CLÁSICO ARGENTO', flavors: ['Amargo', 'Popular'] },
  { id: 2, name: 'Vodka con Speed', description: 'Vodka premium mezclado con bebida energizante.', price: 5000, trending: true, icon: Martini, vibe: 'FIESTA TOTAL', flavors: ['Dulce', 'Energía'] },
  { id: 3, name: 'Campari con Naranja', description: 'Campari con jugo de naranja natural y mucho hielo.', price: 4800, trending: false, icon: Wine, vibe: 'PREVIA', flavors: ['Cítrico', 'Amargo'] },
  { id: 4, name: 'Gancia Batido', description: 'Gancia con jugo de limón, azúcar y hielo batido.', price: 4200, trending: false, icon: Martini, vibe: 'REFRESCANTE', flavors: ['Dulce', 'Cítrico'] },
  { id: 5, name: 'Gin Tonic Premium', description: 'Gin, agua tónica, rodaja de pepino y bayas de enebro.', price: 6000, trending: false, icon: Wine, vibe: 'CHILL TECH', flavors: ['Cítrico', 'Herbal'] },
  { id: 6, name: 'Destornillador', description: 'Vodka clásico con jugo de naranja.', price: 4500, trending: false, icon: Wine, vibe: 'CLÁSICO', flavors: ['Cítrico', 'Dulce'] },
  { id: 7, name: 'Cerveza Corona', description: 'Porrón de cerveza Corona bien fría con limón.', price: 3500, trending: false, icon: Wine, vibe: 'TRANQUI', flavors: ['Refrescante'] },
  { id: 8, name: 'Agua Mineral', description: 'Agua mineral sin gas.', price: 2000, trending: false, icon: DropletOff, vibe: 'CONDUCTOR DESIGNADO', flavors: ['Refrescante'] },
];

export default function Home() {
  const [sortBy, setSortBy] = useState<'alpha' | 'price'>('alpha');
  const [isLoading, setIsLoading] = useState(true);
  const [cart, setCart] = useState<Record<number, number>>({});
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [hasActiveOrders, setHasActiveOrders] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 2000);

    // Limpiar pedidos de más de 6h y chequear si existen para mostrar el botón
    const ordersStr = localStorage.getItem('cocktrail_orders');
    if (ordersStr) {
      const parsed = JSON.parse(ordersStr);
      const valid = parsed.filter((o: any) => Date.now() - o.timestamp < 6 * 3600 * 1000);
      if (valid.length !== parsed.length) localStorage.setItem('cocktrail_orders', JSON.stringify(valid));
      setHasActiveOrders(valid.length > 0);
    }

    return () => clearTimeout(timer);
  }, []);

  const sortedDrinks = useMemo(() => {
    return [...MOCK_DRINKS].sort((a, b) => {
      if (sortBy === 'alpha') return a.name.localeCompare(b.name);
      return a.price - b.price;
    });
  }, [sortBy]);

  const trendingDrinks = useMemo(() => sortedDrinks.filter(d => d.trending), [sortedDrinks]);
  const regularDrinks = useMemo(() => sortedDrinks.filter(d => !d.trending), [sortedDrinks]);

  const addToCart = (id: number) => {
    setCart(prev => ({ ...prev, [id]: (prev[id] || 0) + 1 }));
  };

  const removeFromCart = (id: number) => {
    setCart(prev => {
      const newCart = { ...prev };
      if (newCart[id] > 1) {
        newCart[id] -= 1;
      } else {
        delete newCart[id];
      }
      return newCart;
    });
  };

  const getTotalPrice = () => {
    return Object.entries(cart).reduce((total, [idStr, qty]) => {
      const drink = MOCK_DRINKS.find(d => d.id === Number(idStr));
      return total + (drink?.price || 0) * qty;
    }, 0);
  };

  const getTotalItems = () => {
    return Object.values(cart).reduce((sum, qty) => sum + qty, 0);
  };

  const confirmOrder = () => {
    const newOrder = {
      id: Date.now().toString(),
      items: Object.entries(cart).map(([idStr, qty]) => {
        const drink = MOCK_DRINKS.find(d => d.id === Number(idStr));
        return { name: drink?.name, qty, subtotal: (drink?.price || 0) * qty };
      }),
      total: getTotalPrice(),
      pickupCode: Math.floor(Math.random() * 1000).toString().padStart(3, '0'),
      timestamp: Date.now(),
      status: 'pendiente'
    };
    
    const existingStr = localStorage.getItem('cocktrail_orders');
    const existing = existingStr ? JSON.parse(existingStr) : [];
    existing.push(newOrder);
    localStorage.setItem('cocktrail_orders', JSON.stringify(existing));

    setCart({});
    setIsCartOpen(false);
    router.push('/ticket');
  };

  return (
    <main className="min-h-screen pb-24 relative overflow-hidden bg-[#020617]">
      {/* Modal del Carrito */}
      {isCartOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[#0f172a] border border-[#1e293b] w-full max-w-md rounded-3xl p-6 shadow-2xl animate-in slide-in-from-bottom-10">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-white tracking-tight">Tu Pedido</h2>
              <button onClick={() => setIsCartOpen(false)} className="p-2 bg-[#1e293b] rounded-full text-slate-400 hover:text-white">
                <X size={20} />
              </button>
            </div>

            {Object.keys(cart).length === 0 ? (
              <div className="text-center py-10 text-slate-500">
                <ShoppingBag size={48} className="mx-auto mb-4 opacity-20" />
                <p>No tienes tragos en tu pedido aún.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-4 max-h-[50vh] overflow-y-auto pr-2">
                {Object.entries(cart).map(([idStr, qty]) => {
                  const id = Number(idStr);
                  const drink = MOCK_DRINKS.find(d => d.id === id);
                  if (!drink) return null;
                  const subtotal = drink.price * qty;
                  return (
                    <div key={id} className="flex justify-between items-center text-sm bg-[#020617]/50 p-3 rounded-xl border border-[#1e293b]/50">
                      <div className="flex items-center gap-3">
                        {drink.icon && <drink.icon size={16} className="text-[#38bdf8]/50" />}
                        <div className="flex flex-col">
                          <p className="text-white font-bold leading-tight">{drink.name}</p>
                          <p className="text-slate-400 text-[11px] font-medium">${drink.price.toLocaleString('es-AR')} c/u</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center bg-[#0f172a] rounded-full border border-[#1e293b]">
                          <button 
                            onClick={() => removeFromCart(id)}
                            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#1e293b]/80 text-[#38bdf8] transition-colors"
                          >
                            <Minus size={14} strokeWidth={3} />
                          </button>
                          <span className="text-white font-mono w-4 text-center text-xs">{qty}</span>
                          <button 
                            onClick={() => addToCart(id)}
                            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#1e293b]/80 text-[#38bdf8] transition-colors"
                          >
                            <Plus size={14} strokeWidth={3} />
                          </button>
                        </div>
                        <span className="text-[#38bdf8] font-black min-w-[60px] text-right">${subtotal.toLocaleString('es-AR')}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {Object.keys(cart).length > 0 && (
              <div className="mt-6 pt-6 border-t border-[#1e293b]">
                <div className="flex justify-between items-center mb-6">
                  <span className="text-slate-400">Total a pagar</span>
                  <span className="text-3xl font-black text-white">${getTotalPrice().toLocaleString('es-AR')}</span>
                </div>
                <button 
                  onClick={confirmOrder}
                  className="w-full flex items-center justify-center gap-2 h-14 bg-[#38bdf8] text-[#020617] font-black rounded-2xl hover:bg-[#7dd3fc] active:scale-95 transition-all text-lg"
                >
                  <Check size={20} strokeWidth={3} />
                  Confirmar Pedido
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Header */}
      <header className="sticky top-0 z-40 bg-[#020617]/80 backdrop-blur-xl border-b border-white/5 px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-[#38bdf8] to-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-[#38bdf8]/20">
            <Martini size={20} className="text-[#020617] fill-[#020617]" />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight text-white leading-none">Cocktrail</h1>
            <p className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold mt-1">Menú Digital</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {hasActiveOrders && (
            <button 
              onClick={() => router.push('/ticket')}
              className="w-10 h-10 rounded-xl bg-[#38bdf8]/10 border border-[#38bdf8]/30 flex items-center justify-center text-[#38bdf8] hover:bg-[#38bdf8]/20 transition-all active:scale-95"
            >
              <Receipt size={18} />
            </button>
          )}
          <button 
            onClick={() => setSortBy(prev => prev === 'alpha' ? 'price' : 'alpha')}
            className="w-10 h-10 rounded-xl bg-[#0f172a] border border-[#1e293b] flex items-center justify-center text-slate-400 hover:text-[#38bdf8] hover:border-[#38bdf8]/30 transition-all active:scale-95"
          >
            <ArrowUpDown size={18} />
          </button>
        </div>
      </header>

      <div className="p-5">
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <DrinkSkeleton key={`skeleton-${i}`} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-8 mt-2">
            {/* Trending Section */}
            <section>
              <div className="flex items-center gap-2 mb-4">
                <Flame size={18} className="text-[#38bdf8]" />
                <h2 className="text-sm font-bold uppercase tracking-widest text-[#38bdf8]">TRAGOS EN TENDENCIA</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {trendingDrinks.map(drink => (
                  <DrinkCard 
                    key={`trending-${drink.id}`}
                    name={drink.name}
                    description={drink.description}
                    price={drink.price}
                    icon={drink.icon}
                    vibe={drink.vibe}
                    flavors={drink.flavors}
                    isTrending
                    quantity={cart[drink.id] || 0}
                    onAdd={() => addToCart(drink.id)}
                    onRemove={() => removeFromCart(drink.id)}
                  />
                ))}
              </div>
            </section>

            {/* Main List */}
            <section>
              <h2 className="text-slate-500 text-[10px] font-bold uppercase tracking-[0.2em] mb-4">
                Nuestra Carta — {sortBy === 'alpha' ? 'A a la Z' : 'Precio Menor a Mayor'}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {regularDrinks.map(drink => (
                  <DrinkCard 
                    key={drink.id}
                    name={drink.name}
                    description={drink.description}
                    price={drink.price}
                    icon={drink.icon}
                    vibe={drink.vibe}
                    flavors={drink.flavors}
                    quantity={cart[drink.id] || 0}
                    onAdd={() => addToCart(drink.id)}
                    onRemove={() => removeFromCart(drink.id)}
                  />
                ))}
              </div>
            </section>
          </div>
        )}
      </div>

      {/* Footer Button */}
      {!isCartOpen && !isLoading && getTotalItems() > 0 && (
        <div 
          onClick={() => setIsCartOpen(true)}
          className="fixed bottom-6 inset-x-5 h-14 bg-[#38bdf8] rounded-2xl flex items-center justify-between px-6 shadow-2xl shadow-[#38bdf8]/20 cursor-pointer active:scale-95 transition-transform z-50"
        >
          <div className="flex items-center gap-2">
            <div className="bg-[#020617] text-[#38bdf8] w-6 h-6 rounded-full flex items-center justify-center text-xs font-black">
              {getTotalItems()}
            </div>
            <span className="text-[#020617] font-black uppercase text-xs tracking-wider">Ver Mi Pedido</span>
          </div>
          <span className="text-[#020617] font-black text-lg">${getTotalPrice().toLocaleString('es-AR')}</span>
        </div>
      )}
    </main>
  );
}