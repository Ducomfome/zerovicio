"use client";

import { useEffect, useRef, useState } from "react";
import {
  CheckCircleIcon,
  ShieldCheckIcon,
  TruckIcon,
  BeakerIcon,
  HeartIcon,
  LightBulbIcon,
  XMarkIcon,
  PlayCircleIcon,
  DocumentDuplicateIcon,
  LockClosedIcon,
  StarIcon,
} from "@heroicons/react/24/solid";

// =========================================================
// TIPOS E CONFIGURAÇÕES
// =========================================================
type VideoKey = "vsl" | "test1" | "test2";

const VIDEO_SOURCES: Record<VideoKey, string> = {
  vsl: "[SEU_LINK_DO_VSL_AQUI]",
  test1: "https://pub-9ad786fb39ec4b43b2905a55edcb38d9.r2.dev/baixados%20(1).mp4",
  test2: "https://pub-9ad786fb39ec4b43b2905a55edcb38d9.r2.dev/baixados%20(2).mp4",
};

const POSTER_SOURCES: Record<VideoKey, string> = {
  vsl: "",
  test1: "",
  test2: "",
};

const getCookie = (name: string) => {
  if (typeof document === "undefined") return null;
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop()?.split(";").shift();
  return null;
};

// =========================================================
// COMPONENTE PLAYER (Estilizado e Flexível)
// =========================================================
function Player({
  id,
  src,
  poster,
  currentlyPlaying,
  setCurrentlyPlaying,
  refsMap,
  aspectRatio = "16/9", // NOVO: Padrão 16:9, mas pode ser "9/16", "1/1", etc.
}: {
  id: VideoKey;
  src: string;
  poster: string;
  currentlyPlaying: VideoKey | null;
  setCurrentlyPlaying: (k: VideoKey | null) => void;
  refsMap: React.MutableRefObject<Record<VideoKey, HTMLVideoElement | null>>;
  aspectRatio?: string; // NOVO: Prop para proporção
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [isPosterVisible, setIsPosterVisible] = useState(true);
  const localRef = useRef<HTMLVideoElement | null>(null);
  const isPlaying = currentlyPlaying === id;

  useEffect(() => {
    refsMap.current[id] = localRef.current;
    return () => {
      refsMap.current[id] = null;
    };
  }, [id, refsMap]);

  const handlePlayClick = async () => {
    (Object.keys(refsMap.current) as VideoKey[]).forEach((k) => {
      if (k !== id && refsMap.current[k]) {
        try {
          refsMap.current[k]!.pause();
        } catch {}
      }
    });
    setCurrentlyPlaying(id);
    setIsPosterVisible(false);
    setIsLoading(true);
    try {
      await refsMap.current[id]?.play();
    } catch (err) {
      console.error("Erro ao dar play:", err);
      setIsLoading(false);
      setIsPosterVisible(true);
      setCurrentlyPlaying(null);
    }
  };

  return (
    <div 
      className="relative w-full rounded-2xl shadow-2xl overflow-hidden border-4 border-white ring-1 ring-gray-200 bg-gray-900 group"
      style={{ aspectRatio: aspectRatio }} // NOVO: Define a proporção aqui
    >
      <video
        ref={(el) => {
          localRef.current = el;
          refsMap.current[id] = el;
        }}
        src={src}
        playsInline
        controls={isPlaying}
        onWaiting={() => setIsLoading(true)}
        onPlaying={() => setIsLoading(false)}
        onPause={() => {
          if (currentlyPlaying === id) setCurrentlyPlaying(null);
          setIsPosterVisible(true);
        }}
        onEnded={() => {
          setCurrentlyPlaying(null);
          setIsPosterVisible(true);
        }}
        className="w-full h-full object-cover"
      />
      
      {isPosterVisible && poster && (
        <div className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-105" style={{ backgroundImage: `url(${poster})` }}>
          <div className="absolute inset-0 bg-black/30 group-hover:bg-black/40 transition-all" />
        </div>
      )}

      {isPosterVisible && (
        <div
          onClick={handlePlayClick}
          className="absolute inset-0 z-10 flex items-center justify-center cursor-pointer"
        >
          <div className="relative">
            <div className="absolute inset-0 bg-green-500 rounded-full animate-ping opacity-75"></div>
            <PlayCircleIcon className="relative w-20 h-20 text-white drop-shadow-lg transform transition-transform group-hover:scale-110" />
          </div>
        </div>
      )}

      {isLoading && (
        <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none bg-black/50 backdrop-blur-sm">
          <div className="w-12 h-12 border-4 border-green-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
}
// =========================================================
// PÁGINA PRINCIPAL
// =========================================================
export default function HomePage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [checkoutState, setCheckoutState] = useState<'form' | 'loading' | 'pix' | 'success'>('form');
  const [selectedPlan, setSelectedPlan] = useState<{ name: string; price: number } | null>(null);
  const [pixData, setPixData] = useState<{ qrCodeBase64: string; copiaECola: string; id: string } | null>(null);
  const [currentlyPlaying, setCurrentlyPlaying] = useState<VideoKey | null>(null);
  
  const videoRefs = useRef<Record<VideoKey, HTMLVideoElement | null>>({
    vsl: null, test1: null, test2: null,
  });

  const openModal = (planName: string, price: number) => {
    setSelectedPlan({ name: planName, price });
    setCheckoutState('form');
    setIsModalOpen(true);
  };

  const closeModal = () => setIsModalOpen(false);

  const handleGeneratePix = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setCheckoutState('loading');

    const formData = new FormData(e.currentTarget);
    const userData = {
      name: formData.get('name'),
      email: formData.get('email'),
      phone: formData.get('phone'),
      cpf: formData.get('cpf'),
      plan: selectedPlan?.name,
      price: selectedPlan?.price,
      fbc: getCookie('_fbc'),
      fbp: getCookie('_fbp'),
    };

    try {
      const response = await fetch('/api/gerar-pix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userData),
      });

      const data = await response.json();

      if (response.ok) {
        setPixData(data);
        setCheckoutState('pix');
      } else {
        alert(data.error || 'Erro ao gerar PIX. Tente novamente.');
        setCheckoutState('form');
      }
    } catch (error) {
      console.error(error);
      alert('Erro de conexão.');
      setCheckoutState('form');
    }
  };

  const handleCopyPix = () => {
    if (pixData?.copiaECola) {
      navigator.clipboard.writeText(pixData.copiaECola);
      alert("Código PIX copiado!");
    }
  };

  useEffect(() => {
    return () => {
      (Object.keys(videoRefs.current) as VideoKey[]).forEach((k) => {
        try { videoRefs.current[k]?.pause(); } catch {}
      });
    };
  }, []);

  return (
    <div className="font-sans text-slate-800 bg-slate-50 min-h-screen selection:bg-green-200 selection:text-green-900">
      
      {/* SEÇÃO 1: HERO / VSL */}
      <section className="relative py-16 md:py-28 overflow-hidden">
        {/* Background Image com Overlay */}
        <div 
            className="absolute inset-0 bg-cover bg-center z-0" 
            style={{ backgroundImage: "url('https://images.unsplash.com/photo-1505751172876-fa1923c5c528?ixlib=rb-4.0.3&auto=format&fit=crop&w=1920&q=80')" }}
        ></div>
        <div className="absolute inset-0 bg-gradient-to-b from-slate-900/90 via-slate-900/80 to-slate-50 z-0"></div>

        <div className="max-w-5xl mx-auto px-4 relative z-10 text-center">
          <div className="inline-block px-4 py-1 bg-green-500/20 border border-green-500/30 rounded-full mb-6 backdrop-blur-sm">
             <span className="text-green-300 font-semibold text-sm uppercase tracking-wider">Revelação Científica</span>
          </div>
          
          <h1 className="text-3xl md:text-6xl font-extrabold text-white mb-6 leading-tight">
            A Jornada Para Se <span className="text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-300">Libertar do Vício</span> Começa Agora
          </h1>
          
          <p className="text-lg md:text-xl text-slate-300 mb-10 max-w-3xl mx-auto leading-relaxed">
            Descubra o método natural que está devolvendo o controle e a dignidade para milhares de homens comuns. Assista antes que saia do ar.
          </p>

          <div className="max-w-4xl mx-auto transform hover:scale-[1.01] transition-transform duration-500">
            <Player
              id="vsl"
              src={VIDEO_SOURCES.vsl}
              poster={POSTER_SOURCES.vsl}
              currentlyPlaying={currentlyPlaying}
              setCurrentlyPlaying={setCurrentlyPlaying}
              refsMap={videoRefs}
            />
          </div>

          <div className="mt-12">
            <a
              href="#oferta"
              className="group relative inline-flex items-center justify-center bg-gradient-to-r from-green-500 to-emerald-600 text-white text-xl md:text-2xl font-bold py-5 px-12 rounded-full shadow-lg shadow-green-500/30 hover:shadow-green-500/50 transition-all duration-300 transform hover:-translate-y-1"
            >
              <span className="absolute w-full h-full bg-white/20 animate-pulse rounded-full"></span>
              QUERO O MEU ZERO VICIOS AGORA
              <TruckIcon className="w-8 h-8 ml-3 group-hover:translate-x-1 transition-transform" />
            </a>
            <div className="mt-4 flex items-center justify-center gap-2 text-slate-400 text-sm">
                <LockClosedIcon className="w-4 h-4" /> Compra Segura e Discreta
            </div>
          </div>
        </div>
      </section>

      {/* SEÇÃO 2: PROVAS SOCIAIS */}
      <section className="py-16 bg-white">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
              Histórias Reais, <span className="text-green-600">Resultados Reais</span>
            </h2>
            <div className="h-1 w-24 bg-green-500 mx-auto rounded-full"></div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12">
             {/* Wrapper para dar um estilo visual nos vídeos de depoimento */}
             <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 shadow-lg">
                <Player
                id="test1"
                src={VIDEO_SOURCES.test1}
                poster={POSTER_SOURCES.test1}
                currentlyPlaying={currentlyPlaying}
                setCurrentlyPlaying={setCurrentlyPlaying}
                refsMap={videoRefs}
                />
                <div className="mt-4 flex items-center gap-2">
                    <div className="w-10 h-10 bg-slate-300 rounded-full flex items-center justify-center text-slate-600 font-bold">M</div>
                    <div>
                        <p className="font-bold text-slate-800">Valdirene S.</p>
                        <div className="flex text-yellow-400 text-xs"><StarIcon className="w-4 h-4"/><StarIcon className="w-4 h-4"/><StarIcon className="w-4 h-4"/><StarIcon className="w-4 h-4"/><StarIcon className="w-4 h-4"/></div>
                    </div>
                </div>
            </div>

            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 shadow-lg">
                <Player
                id="test2"
                src={VIDEO_SOURCES.test2}
                poster={POSTER_SOURCES.test2}
                currentlyPlaying={currentlyPlaying}
                setCurrentlyPlaying={setCurrentlyPlaying}
                refsMap={videoRefs}
                />
                 <div className="mt-4 flex items-center gap-2">
                    <div className="w-10 h-10 bg-slate-300 rounded-full flex items-center justify-center text-slate-600 font-bold">J</div>
                    <div>
                        <p className="font-bold text-slate-800">Maria P.</p>
                        <div className="flex text-yellow-400 text-xs"><StarIcon className="w-4 h-4"/><StarIcon className="w-4 h-4"/><StarIcon className="w-4 h-4"/><StarIcon className="w-4 h-4"/><StarIcon className="w-4 h-4"/></div>
                    </div>
                </div>
            </div>
          </div>
        </div>
      </section>

      {/* SEÇÃO 3: BENEFÍCIOS */}
      <section className="py-20 bg-slate-50 relative overflow-hidden">
        <div className="max-w-6xl mx-auto px-4 relative z-10">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900">
              Tecnologia Natural Avançada
            </h2>
            <p className="mt-4 text-slate-600 text-lg">Por que o Zero Vicios funciona onde outros falham?</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { icon: HeartIcon, title: "Equilíbrio Emocional", desc: "Ativos que modulam o sistema nervoso, reduzindo a ansiedade e a compulsão." },
              { icon: BeakerIcon, title: "Pureza Garantida", desc: "Fórmula 100% limpa, sem aditivos viciantes ou efeitos colaterais indesejados." },
              { icon: LightBulbIcon, title: "Clareza Mental", desc: "Recupere o foco e a produtividade que o vício roubou de você." }
            ].map((item, idx) => (
                <div key={idx} className="bg-white p-8 rounded-2xl shadow-lg border border-slate-100 hover:shadow-xl transition-shadow hover:-translate-y-1 duration-300">
                    <div className="w-16 h-16 bg-green-100 rounded-2xl flex items-center justify-center mb-6 text-green-600 mx-auto">
                        <item.icon className="w-8 h-8" />
                    </div>
                    <h3 className="text-xl font-bold text-slate-900 mb-3 text-center">{item.title}</h3>
                    <p className="text-slate-600 text-center leading-relaxed">{item.desc}</p>
                </div>
            ))}
          </div>
        </div>
      </section>

      {/* SEÇÃO 5: OFERTA (DESIGN MODERNO) */}
      <section id="oferta" className="py-20 bg-gradient-to-b from-white to-slate-100">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-16">
            <span className="text-green-600 font-bold tracking-wider uppercase text-sm">Oferta Exclusiva</span>
            <h2 className="text-3xl md:text-5xl font-bold text-slate-900 mt-2">Escolha o Seu Tratamento</h2>
            <p className="mt-4 text-slate-600 max-w-2xl mx-auto">Preços especiais de lançamento com frete grátis para todo o Brasil.</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-center max-w-6xl mx-auto">
            
            {/* CARD 1: 3 MESES */}
            <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-8 transition-transform hover:scale-105 order-2 lg:order-1">
              <div className="text-center">
                <h3 className="text-2xl font-bold text-slate-800">Tratamento Inicial</h3>
                <p className="text-sm text-slate-500 mb-6">Kit 3 Meses</p>
                <div className="relative h-48 w-full mb-4">
                     <img src="https://i.imgur.com/5wouai7.png" alt="Kit 3" className="object-contain w-full h-full" />
                </div>
                <div className="flex justify-center items-baseline mb-6">
                    <span className="text-3xl font-bold text-slate-900">R$ 123,90</span>
                </div>
                <button 
                  onClick={() => openModal("Kit 3 Meses", 123.90)} 
                  className="w-full bg-slate-100 hover:bg-slate-200 text-slate-900 font-bold py-4 rounded-xl transition-colors"
                >
                  COMPRAR AGORA
                </button>
              </div>
            </div>

            {/* CARD 2: 5 MESES (DESTAQUE) */}
            <div className="relative bg-white rounded-3xl shadow-2xl shadow-green-900/10 border-2 border-green-500 p-8 transform scale-105 z-10 order-1 lg:order-2">
              <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-green-600 text-white px-6 py-2 rounded-full text-sm font-bold uppercase tracking-wide shadow-lg">
                Mais Vendido
              </div>
              <div className="text-center mt-4">
                <h3 className="text-3xl font-bold text-slate-900">Tratamento Completo</h3>
                <p className="text-green-600 font-medium mb-6">Kit 5 Meses (Recomendado)</p>
                <div className="relative h-56 w-full mb-6">
                     <img src="https://i.imgur.com/pNINamC.png" alt="Kit 5" className="object-contain w-full h-full transform scale-110" />
                </div>
                <div className="mb-8">
                    <p className="text-sm text-slate-400 line-through">De R$ 297,00</p>
                    <span className="text-5xl font-extrabold text-slate-900">R$ 167,90</span>
                    <p className="text-green-600 text-sm font-bold mt-2">Você economiza muito!</p>
                </div>
                
                <ul className="text-left space-y-3 mb-8 bg-slate-50 p-4 rounded-lg text-sm text-slate-700">
                    <li className="flex items-center"><CheckCircleIcon className="w-5 h-5 text-green-500 mr-2"/> Tratamento Ideal (150 dias)</li>
                    <li className="flex items-center"><TruckIcon className="w-5 h-5 text-green-500 mr-2"/> Frete Grátis e Prioritário</li>
                    <li className="flex items-center"><ShieldCheckIcon className="w-5 h-5 text-green-500 mr-2"/> Garantia Blindada</li>
                </ul>

                <button 
                  onClick={() => openModal("Kit 5 Meses", 167.90)} 
                  className="w-full bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white text-xl font-bold py-5 rounded-xl shadow-lg shadow-green-500/30 transition-all animate-pulse"
                >
                  QUERO O MAIS VENDIDO
                </button>
              </div>
            </div>

            {/* CARD 3: 12 MESES */}
            <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-8 transition-transform hover:scale-105 order-3">
              <div className="text-center">
                <h3 className="text-2xl font-bold text-slate-800">Estoque Anual</h3>
                <p className="text-sm text-slate-500 mb-6">Kit 12 Meses</p>
                <div className="relative h-48 w-full mb-4">
                     <img src="https://i.imgur.com/aJoKk1u.png" alt="Kit 12" className="object-contain w-full h-full" />
                </div>
                <div className="flex justify-center items-baseline mb-6">
                    <span className="text-3xl font-bold text-slate-900">R$ 227,90</span>
                </div>
                <button 
                  onClick={() => openModal("Kit 12 Meses", 227.90)} 
                  className="w-full bg-slate-100 hover:bg-slate-200 text-slate-900 font-bold py-4 rounded-xl transition-colors"
                >
                  COMPRAR AGORA
                </button>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* SEÇÃO 6: GARANTIA */}
      <section className="py-16 bg-white border-t border-slate-100">
        <div className="max-w-3xl mx-auto px-4 text-center">
            <div className="inline-block p-4 bg-green-100 rounded-full mb-6">
                <ShieldCheckIcon className="w-12 h-12 text-green-600" />
            </div>
          <h2 className="text-3xl font-bold text-slate-900 mb-4">Garantia Incondicional de 30 Dias</h2>
          <p className="text-lg text-slate-600 mb-8 leading-relaxed">
            O risco é todo nosso. Se você não notar diferença na sua ansiedade ou controle, nós devolvemos 100% do seu dinheiro. Sem letras miúdas.
          </p>
          <img src="https://logodownload.org/wp-content/uploads/2014/07/anvisa-logo-1.png" alt="Anvisa" className="h-12 mx-auto opacity-50 grayscale hover:grayscale-0 transition-all" />
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16 bg-slate-50">
        <div className="max-w-3xl mx-auto px-4">
            <h2 className="text-3xl font-bold text-center text-slate-900 mb-10">Dúvidas Frequentes</h2>
            <div className="space-y-4">
                {[
                    {q: "Como o envio é feito?", a: "Enviamos em embalagem 100% discreta (caixa parda sem logos), ninguém saberá o que tem dentro."},
                    {q: "Tem efeitos colaterais?", a: "Não. Por ser 100% natural, não causa sonolência excessiva nem dependência."},
                    {q: "Aceitam cartão?", a: "No momento estamos priorizando o PIX para garantir o menor preço possível sem taxas de operadoras de cartão."}
                ].map((faq, i) => (
                    <div key={i} className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                        <h3 className="font-bold text-slate-800 text-lg mb-2">{faq.q}</h3>
                        <p className="text-slate-600">{faq.a}</p>
                    </div>
                ))}
            </div>
        </div>
      </section>

      {/* RODAPÉ */}
      <footer className="py-12 bg-slate-900 text-slate-400 text-sm border-t border-slate-800">
        <div className="max-w-6xl mx-auto px-4 text-center md:text-left flex flex-col md:flex-row justify-between items-center gap-6">
          <div>
             <p className="font-bold text-white text-lg mb-2">ZERO VICIOS</p>
             <p>Copyright © {new Date().getFullYear()} - Todos os direitos reservados.</p>
          </div>
          <div className="flex gap-6">
             <img src="https://img.icons8.com/color/48/000000/pix.png" alt="Pix" className="h-8" />
             <div className="flex items-center gap-1"><LockClosedIcon className="w-4 h-4"/> Site Seguro</div>
          </div>
        </div>
      </footer>

      {/* MODAL DE CHECKOUT OTIMIZADO */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm transition-opacity">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md relative overflow-hidden flex flex-col max-h-[90vh] animate-fade-in-up">
            
            <button onClick={closeModal} className="absolute top-4 right-4 text-slate-400 hover:text-slate-800 z-10 bg-slate-100 rounded-full p-1 transition-colors">
              <XMarkIcon className="w-6 h-6" />
            </button>

            {/* Header do Modal */}
            <div className="bg-slate-50 p-6 border-b border-slate-100 text-center">
                 <div className="flex justify-center mb-2">
                    <LockClosedIcon className="w-5 h-5 text-green-500 mr-1" />
                    <span className="text-xs font-bold text-green-600 uppercase tracking-wide">Ambiente Seguro</span>
                 </div>
                 
                 {checkoutState === 'form' && (
                    <>
                        <h3 className="text-xl font-bold text-slate-900">Finalizar Pedido</h3>
                        <p className="text-slate-500 text-sm mt-1">{selectedPlan?.name} — <span className="font-bold text-green-600">R$ {selectedPlan?.price.toFixed(2)}</span></p>
                    </>
                 )}
                 {checkoutState === 'pix' && <h3 className="text-xl font-bold text-slate-900">Pagamento via PIX</h3>}
            </div>

            <div className="p-6 overflow-y-auto">
              {/* FORMULÁRIO */}
              {checkoutState === 'form' && (
                <form onSubmit={handleGeneratePix} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Nome Completo</label>
                    <input type="text" name="name" className="w-full bg-slate-50 border border-slate-300 rounded-lg p-3 focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all" placeholder="Seu nome" required />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Email</label>
                    <input type="email" name="email" className="w-full bg-slate-50 border border-slate-300 rounded-lg p-3 focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all" placeholder="seu@email.com" required />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-700 uppercase mb-1">CPF</label>
                        <input type="text" name="cpf" className="w-full bg-slate-50 border border-slate-300 rounded-lg p-3 focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all" placeholder="000.000.000-00" required />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-700 uppercase mb-1">WhatsApp</label>
                        <input type="tel" name="phone" className="w-full bg-slate-50 border border-slate-300 rounded-lg p-3 focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all" placeholder="(DDD) 9..." required />
                    </div>
                  </div>
                  
                  <button type="submit" className="mt-6 w-full bg-green-600 hover:bg-green-700 text-white font-bold py-4 rounded-lg shadow-lg shadow-green-500/20 transition-all transform active:scale-95 flex items-center justify-center gap-2">
                    <LockClosedIcon className="w-5 h-5" />
                    GERAR PIX SEGURO
                  </button>
                  <p className="text-center text-xs text-slate-400 mt-3">Seus dados estão protegidos com criptografia de 256-bits.</p>
                </form>
              )}

              {/* LOADING */}
              {checkoutState === 'loading' && (
                <div className="flex flex-col items-center py-10">
                  <div className="animate-spin rounded-full h-12 w-12 border-4 border-slate-200 border-t-green-500 mb-4"></div>
                  <p className="text-slate-600 font-medium">Gerando seu QR Code...</p>
                </div>
              )}

              {/* PIX DISPLAY (COM CORREÇÃO DE IMAGEM) */}
              {checkoutState === 'pix' && pixData && (
                <div className="text-center space-y-6 animate-fade-in">
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 inline-block shadow-inner">
                    <img 
                        src={
                        pixData.qrCodeBase64 
                            ? (pixData.qrCodeBase64.startsWith('data:image') 
                                ? pixData.qrCodeBase64 
                                : `data:image/png;base64,${pixData.qrCodeBase64}`)
                            : `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(pixData.copiaECola)}`
                        } 
                        alt="QR Code Pix" 
                        className="w-48 h-48 mx-auto mix-blend-multiply" 
                        onError={(e) => {
                        e.currentTarget.src = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(pixData.copiaECola)}`;
                        }}
                    />
                  </div>
                  
                  <div className="bg-blue-50 p-4 rounded-lg text-left">
                    <p className="text-xs font-bold text-blue-800 mb-2 uppercase">Copia e Cola</p>
                    <div className="flex gap-2">
                        <input readOnly value={pixData.copiaECola} className="w-full bg-white border border-blue-200 text-slate-600 text-xs rounded p-2 outline-none truncate" onClick={(e) => e.currentTarget.select()} />
                        <button onClick={handleCopyPix} className="bg-blue-600 hover:bg-blue-700 text-white p-2 rounded transition-colors"><DocumentDuplicateIcon className="w-4 h-4" /></button>
                    </div>
                  </div>

                  <div className="text-sm text-slate-500">
                    <p>1. Abra o app do seu banco</p>
                    <p>2. Escolha "Pix Copia e Cola"</p>
                    <p>3. Cole o código e confirme</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
