// Arquivo: app/page.tsx
"use client";

import Image from "next/image";
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
  QrCodeIcon,
  DocumentDuplicateIcon,
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
  vsl: "https://via.placeholder.com/1280x720.png?text=Capa+do+VSL",
  test1: "https://via.placeholder.com/1280x720.png?text=Capa+Prova+1",
  test2: "https://via.placeholder.com/1280x720.png?text=Capa+Prova+2",
};

// Função auxiliar para pegar cookies (fbc/fbp) sem bibliotecas extras
const getCookie = (name: string) => {
  if (typeof document === "undefined") return null;
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop()?.split(";").shift();
  return null;
};

// =========================================================
// COMPONENTE PLAYER
// =========================================================
function Player({
  id,
  src,
  poster,
  currentlyPlaying,
  setCurrentlyPlaying,
  refsMap,
}: {
  id: VideoKey;
  src: string;
  poster: string;
  currentlyPlaying: VideoKey | null;
  setCurrentlyPlaying: (k: VideoKey | null) => void;
  refsMap: React.MutableRefObject<Record<VideoKey, HTMLVideoElement | null>>;
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
    <div className="relative aspect-w-16 aspect-h-9 rounded-lg shadow-lg overflow-hidden border-2 border-blue-500 bg-gradient-to-br from-gray-100 to-gray-300">
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
        <img
          src={poster}
          alt=""
          className="absolute inset-0 w-full h-full object-cover rounded-lg pointer-events-none"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
      )}
      {isPosterVisible && (
        <div
          onClick={handlePlayClick}
          className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 cursor-pointer"
        >
          <PlayCircleIcon className="w-20 h-20 text-white opacity-95" />
        </div>
      )}
      {isLoading && (
        <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none bg-black/20">
          <div className="w-14 h-14 border-4 border-white border-t-transparent rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
}

// =========================================================
// PÁGINA PRINCIPAL
// =========================================================
export default function HomePage() {
  // Estados do Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [checkoutState, setCheckoutState] = useState<'form' | 'loading' | 'pix' | 'success'>('form');
  const [selectedPlan, setSelectedPlan] = useState<{ name: string; price: number } | null>(null);
  
  // Dados do PIX gerado
  const [pixData, setPixData] = useState<{ qrCodeBase64: string; copiaECola: string; id: string } | null>(null);

  // Player States
  const [currentlyPlaying, setCurrentlyPlaying] = useState<VideoKey | null>(null);
  const videoRefs = useRef<Record<VideoKey, HTMLVideoElement | null>>({
    vsl: null,
    test1: null,
    test2: null,
  });

  // Abrir modal com dados do plano
  const openModal = (planName: string, price: number) => {
    setSelectedPlan({ name: planName, price });
    setCheckoutState('form');
    setIsModalOpen(true);
  };

  const closeModal = () => setIsModalOpen(false);

  // Lógica de Gerar Pix (Integração com API)
  const handleGeneratePix = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setCheckoutState('loading');

    const formData = new FormData(e.currentTarget);
    const userData = {
      name: formData.get('name'),
      email: formData.get('email'),
      phone: formData.get('phone'),
      cpf: formData.get('cpf'), // Pix geralmente precisa de CPF
      plan: selectedPlan?.name,
      price: selectedPlan?.price,
      fbc: getCookie('_fbc'), // Pega cookies do Facebook automaticamente
      fbp: getCookie('_fbp'),
    };

    try {
      // Chamada para a API Serverless (Código abaixo)
      const response = await fetch('/api/gerar-pix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userData),
      });

      const data = await response.json();

      if (response.ok) {
        setPixData(data);
        setCheckoutState('pix');
        // Aqui você iniciaria um "polling" para verificar status
      } else {
        alert('Erro ao gerar PIX. Tente novamente.');
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
        try {
          videoRefs.current[k]?.pause();
        } catch {}
      });
    };
  }, []);

  return (
    <div className="bg-white text-gray-800 min-h-screen">
      {/* SEÇÃO 1: VSL */}
      <section
        className="py-12 md:py-20 relative bg-cover bg-center"
        style={{
          backgroundImage: "url('https://i.ibb.co/VvzHf8r/light-green-medical-bg.png')",
        }}
      >
        <div className="absolute inset-0 bg-white bg-opacity-70 backdrop-blur-sm" />
        <div className="max-w-4xl mx-auto px-4 text-center relative z-10">
          <h1 className="text-3xl md:text-5xl font-bold text-gray-900 mb-6">
            Conheça o Zero Vicios: A Jornada Para Se Libertar Começa Hoje
          </h1>
          <p className="text-lg md:text-xl text-gray-700 mb-8">
            Assista ao vídeo abaixo e descubra como a fórmula Zero Vicios está ajudando...
          </p>
          <div className="max-w-4xl mx-auto">
            <Player
              id="vsl"
              src={VIDEO_SOURCES.vsl}
              poster={POSTER_SOURCES.vsl}
              currentlyPlaying={currentlyPlaying}
              setCurrentlyPlaying={setCurrentlyPlaying}
              refsMap={videoRefs}
            />
          </div>
          <a
            href="#oferta"
            className="mt-10 inline-block bg-green-500 text-white text-xl md:text-2xl font-bold py-4 px-10 rounded-lg shadow-lg hover:bg-green-600 transition-all duration-300 transform hover:scale-105"
          >
            QUERO O MEU ZERO VICIOS AGORA!
          </a>
        </div>
      </section>

      {/* SEÇÃO 2: PROVAS SOCIAIS */}
      <section className="py-12 md:py-20 bg-white">
        <div className="max-w-5xl mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-bold text-center text-gray-900 mb-12">
            Veja a Transformação Real de Nossos Clientes
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <Player
              id="test1"
              src={VIDEO_SOURCES.test1}
              poster={POSTER_SOURCES.test1}
              currentlyPlaying={currentlyPlaying}
              setCurrentlyPlaying={setCurrentlyPlaying}
              refsMap={videoRefs}
            />
            <Player
              id="test2"
              src={VIDEO_SOURCES.test2}
              poster={POSTER_SOURCES.test2}
              currentlyPlaying={currentlyPlaying}
              setCurrentlyPlaying={setCurrentlyPlaying}
              refsMap={videoRefs}
            />
          </div>
        </div>
      </section>

      {/* SEÇÃO 3: BENEFÍCIOS */}
      <section className="py-12 md:py-20 bg-gray-50">
        <div className="max-w-5xl mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-bold text-center text-gray-900 mb-12">
            A Solução Completa do Zero Vicios
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
            <div className="flex flex-col items-center">
              <HeartIcon className="w-12 h-12 text-blue-500 mb-4" />
              <h3 className="text-xl font-bold text-gray-900 mb-2">Auxilia no Bem-Estar</h3>
              <p className="text-gray-700">Componentes que ajudam a reduzir a ansiedade e promovem a calma.</p>
            </div>
            <div className="flex flex-col items-center">
              <BeakerIcon className="w-12 h-12 text-blue-500 mb-4" />
              <h3 className="text-xl font-bold text-gray-900 mb-2">Fórmula 100% Natural</h3>
              <p className="text-gray-700">Livre de aditivos químicos, focado em ingredientes seguros e comprovados.</p>
            </div>
            <div className="flex flex-col items-center">
              <LightBulbIcon className="w-12 h-12 text-blue-500 mb-4" />
              <h3 className="text-xl font-bold text-gray-900 mb-2">Mais Foco e Clareza</h3>
              <p className="text-gray-700">Ajuda a recuperar o foco perdido e melhora a clareza mental no dia a dia.</p>
            </div>
          </div>
        </div>
      </section>

      {/* SEÇÃO 4: COMO FUNCIONA */}
      <section className="py-12 md:py-20 bg-white">
        <div className="max-w-5xl mx-auto px-4 flex flex-col md:flex-row items-center gap-12">
          <div className="w-full md:w-1/2">
            <img
              src="https://i.imgur.com/pNINamC.png"
              alt="Frascos Zero Vicios"
              className="w-full h-auto object-contain rounded-lg shadow-lg"
            />
          </div>
          <div className="w-full md:w-1/2">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-6">Como o Zero Vicios Funciona?</h2>
            <p className="text-lg text-gray-700 mb-4">
              Nossa fórmula combina ingredientes naturais e potentes, cuidadosamente selecionados para agir diretamente na causa raiz da ansiedade e dos impulsos.
            </p>
            <p className="text-lg text-gray-700 mb-6">
              Ao contrário de soluções paliativas, o <strong>Zero Vicios</strong> foca em nutrir o corpo e reequilibrar o sistema nervoso, oferecendo um suporte real e duradouro.
            </p>
            <ul className="space-y-3">
              <li className="flex items-center text-lg">
                <CheckCircleIcon className="w-6 h-6 text-green-500 mr-2" />
                Ingrediente A (Reduz ansiedade)
              </li>
              <li className="flex items-center text-lg">
                <CheckCircleIcon className="w-6 h-6 text-green-500 mr-2" />
                Ingrediente B (Melhora o sono)
              </li>
              <li className="flex items-center text-lg">
                <CheckCircleIcon className="w-6 h-6 text-green-500 mr-2" />
                Ingrediente C (Aumenta a energia)
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* SEÇÃO 5: OFERTA */}
      <section id="oferta" className="py-12 md:py-20 bg-gray-50">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">Aproveite a Oferta Especial de Lançamento</h2>
            <p className="text-lg text-gray-600">Estoques limitados. Esta oferta pode encerrar a qualquer momento.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 items-start">
            
            {/* PLANO 1: 3 MESES */}
            <div className="bg-white border-2 border-gray-300 rounded-lg shadow-xl p-6 h-full flex flex-col">
              <img
                src="https://i.imgur.com/5wouai7.png"
                alt="Kit 3 Meses"
                className="w-full h-auto object-contain mx-auto mb-4 rounded-lg"
              />
              <h3 className="text-2xl font-bold mt-4 text-gray-900 text-center">Kit 3 Meses</h3>
              <p className="text-5xl md:text-6xl font-extrabold text-blue-500 my-4 text-center">R$ 123,90</p>
              
              <div className="text-left text-lg space-y-3 mb-8 text-gray-700 mt-4">
                <p className="flex items-center"><CheckCircleIcon className="w-6 h-6 text-green-500 mr-2" /> Tratamento para 90 dias</p>
                <p className="flex items-center"><TruckIcon className="w-6 h-6 text-blue-500 mr-2" /> <span className="font-bold">FRETE GRÁTIS</span></p>
                <p className="flex items-center"><ShieldCheckIcon className="w-6 h-6 text-green-500 mr-2" /> Compra 100% Segura</p>
              </div>

              <button 
                onClick={() => openModal("Kit 3 Meses", 123.90)} 
                className="w-full mt-auto inline-block bg-blue-500 text-white text-xl md:text-2xl font-bold py-4 px-8 rounded-lg shadow-lg hover:bg-blue-600 transition-all duration-300"
              >
                COMPRAR AGORA
              </button>
            </div>

            {/* PLANO 2: 5 MESES */}
            <div className="bg-white border-2 border-amber-400 rounded-lg shadow-2xl p-6 ring-4 ring-amber-400 ring-opacity-30 transform md:-translate-y-6 h-full flex flex-col">
              <span className="text-base mx-auto bg-amber-400 text-black font-bold py-1 px-4 rounded-full uppercase">Mais Vendido</span>
              <img
                src="https://i.imgur.com/pNINamC.png"
                alt="Kit 5 Meses"
                className="w-full h-auto object-contain mx-auto mb-4 rounded-lg"
              />
              <h3 className="text-2xl font-bold mt-4 text-gray-900 text-center">Kit 5 Meses</h3>
              <p className="text-5xl md:text-6xl font-extrabold text-green-500 my-4 text-center">R$ 167,90</p>

              <div className="text-left text-lg space-y-3 mb-8 text-gray-700 mt-4">
                <p className="flex items-center"><CheckCircleIcon className="w-6 h-6 text-green-500 mr-2" /> Tratamento para 150 dias</p>
                <p className="flex items-center"><TruckIcon className="w-6 h-6 text-blue-500 mr-2" /> <span className="font-bold">FRETE GRÁTIS</span></p>
                <p className="flex items-center"><ShieldCheckIcon className="w-6 h-6 text-green-500 mr-2" /> Compra 100% Segura</p>
              </div>

              <button 
                onClick={() => openModal("Kit 5 Meses", 167.90)} 
                className="w-full mt-auto inline-block bg-green-500 text-white text-xl md:text-2xl font-bold py-4 px-8 rounded-lg shadow-lg hover:bg-green-600 transition-all duration-300 animate-pulse transform hover:scale-105"
              >
                QUERO O MAIS VENDIDO
              </button>
            </div>

            {/* PLANO 3: 12 MESES */}
            <div className="bg-white border-2 border-gray-300 rounded-lg shadow-xl p-6 h-full flex flex-col">
              <img
                src="https://i.imgur.com/aJoKk1u.png"
                alt="Kit 12 Meses"
                className="w-full h-auto object-contain mx-auto mb-4 rounded-lg"
              />
              <h3 className="text-2xl font-bold mt-4 text-gray-900 text-center">Kit 12 Meses</h3>
              <p className="text-5xl md:text-6xl font-extrabold text-blue-500 my-4 text-center">R$ 227,90</p>
              
              <div className="text-left text-lg space-y-3 mb-8 text-gray-700 mt-4">
                <p className="flex items-center"><CheckCircleIcon className="w-6 h-6 text-green-500 mr-2" /> Tratamento para 365 dias</p>
                <p className="flex items-center"><TruckIcon className="w-6 h-6 text-blue-500 mr-2" /> <span className="font-bold">FRETE GRÁTIS</span></p>
                <p className="flex items-center"><ShieldCheckIcon className="w-6 h-6 text-green-500 mr-2" /> Compra 100% Segura</p>
              </div>

              <button 
                onClick={() => openModal("Kit 12 Meses", 227.90)} 
                className="w-full mt-auto inline-block bg-blue-500 text-white text-xl md:text-2xl font-bold py-4 px-8 rounded-lg shadow-lg hover:bg-blue-600 transition-all duration-300"
              >
                COMPRAR AGORA
              </button>
            </div>

          </div>
        </div>
      </section>

      {/* SEÇÃO 6: GARANTIA */}
      <section className="py-12 md:py-20 bg-white">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">Risco Zero Para Você</h2>
          <p className="text-lg text-gray-700 mb-4">Temos total confiança na eficácia do Zero Vicios. Por isso, oferecemos uma <strong>Garantia Incondicional de 30 Dias</strong>.</p>
          <p className="text-lg text-gray-700">Se você não sentir uma melhora significativa ou não ficar satisfeito por qualquer motivo, basta nos enviar um e-mail dentro de 30 dias e devolveremos 100% do seu investimento.</p>
        </div>
      </section>

      {/* SEÇÃO 7: FAQ */}
      <section className="py-12 md:py-20 bg-gray-50">
        <div className="max-w-3xl mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-bold text-center text-gray-900 mb-12">Perguntas Frequentes sobre o Zero Vicios</h2>
          <div className="space-y-6">
            <div className="border-b border-gray-200 pb-4">
              <h3 className="text-xl font-semibold text-gray-900 mb-2">O Zero Vicios é aprovado pela ANVISA?</h3>
              <p className="text-gray-700">Sim. O Zero Vicios não é um medicamento, mas um suplemento. Ele é 100% natural e é dispensado de registro conforme a RDC 240/2018 da ANVISA, sendo considerado seguro para o consumo.</p>
            </div>
            <div className="border-b border-gray-200 pb-4">
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Como devo utilizar o Zero Vicios?</h3>
              <p className="text-gray-700">A recomendação é tomar **20 gotas (1ml)** por dia, preferencialmente sublingual (debaixo da língua), 10 gotas pela manhã e 10 gotas à noite.</p>
            </div>
            <div className="border-b border-gray-200 pb-4">
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Em quanto tempo vejo resultados?</h3>
              <p className="text-gray-700">Os resultados variam de pessoa para pessoa, mas muitos clientes relatam sentir os primeiros benefícios (como redução da ansiedade) já na primeira semana de uso.</p>
            </div>
            <div className="border-b border-gray-200 pb-4">
              <h3 className="text-xl font-semibold text-gray-900 mb-2">O site é seguro para comprar?</h3>
              <p className="text-gray-700">Absolutamente. Nosso site utiliza criptografia SSL (o cadeado verde) e o processamento de pagamento é feito pelas maiores plataformas do Brasil, garantindo total segurança dos seus dados.</p>
            </div>
          </div>
        </div>
      </section>

      {/* RODAPÉ */}
      <footer className="text-center py-10 bg-gray-800 text-gray-400 text-sm">
        <div className="max-w-4xl mx-auto px-4">
          <p>Copyright © {new Date().getFullYear()} - Zero Vicios - Todos os direitos reservados.</p>
          <p className="mt-2">Este produto não se destina a diagnosticar, tratar, curar ou prevenir qualquer doença. Os resultados individuais podem variar.</p>
          <div className="flex justify-center gap-4 mt-4">
            <a href="#" className="hover:text-white">Termos de Uso</a>
            <a href="#" className="hover:text-white">Política de Privacidade</a>
          </div>
        </div>
      </footer>

      {/* MODAL DE CAPTURA / CHECKOUT */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75 p-4">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-md relative overflow-hidden flex flex-col max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            
            {/* Botão Fechar */}
            <button onClick={closeModal} className="absolute top-4 right-4 text-gray-400 hover:text-gray-800 z-10">
              <XMarkIcon className="w-6 h-6" />
            </button>

            {/* HEADERS DO MODAL (Dependendo do estado) */}
            <div className="p-6 bg-gray-50 border-b">
              {checkoutState === 'form' && (
                <>
                  <h2 className="text-2xl font-bold text-gray-900 text-center">Quase lá!</h2>
                  <p className="text-gray-600 text-center">Preencha para gerar seu PIX seguro.</p>
                  {selectedPlan && <p className="text-center font-bold text-green-600 mt-2">{selectedPlan.name} - R$ {selectedPlan.price.toFixed(2)}</p>}
                </>
              )}
              {checkoutState === 'loading' && (
                <h2 className="text-2xl font-bold text-gray-900 text-center">Gerando PIX...</h2>
              )}
              {checkoutState === 'pix' && (
                <h2 className="text-2xl font-bold text-gray-900 text-center">Pague com PIX</h2>
              )}
              {checkoutState === 'success' && (
                <h2 className="text-2xl font-bold text-green-600 text-center">Pagamento Aprovado!</h2>
              )}
            </div>

            {/* CORPO DO MODAL */}
            <div className="p-6 overflow-y-auto">
              
              {/* ESTADO 1: FORMULÁRIO */}
              {checkoutState === 'form' && (
                <form onSubmit={handleGeneratePix} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Nome Completo</label>
                    <input type="text" name="name" className="mt-1 block w-full rounded-md border border-gray-300 shadow-sm p-3 focus:ring-blue-500 focus:border-blue-500" placeholder="Seu nome" required />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Email</label>
                    <input type="email" name="email" className="mt-1 block w-full rounded-md border border-gray-300 shadow-sm p-3 focus:ring-blue-500 focus:border-blue-500" placeholder="voce@email.com" required />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">CPF (Para Nota Fiscal)</label>
                    <input type="text" name="cpf" className="mt-1 block w-full rounded-md border border-gray-300 shadow-sm p-3 focus:ring-blue-500 focus:border-blue-500" placeholder="000.000.000-00" required />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Celular (WhatsApp)</label>
                    <input type="tel" name="phone" className="mt-1 block w-full rounded-md border border-gray-300 shadow-sm p-3 focus:ring-blue-500 focus:border-blue-500" placeholder="(99) 99999-9999" required />
                  </div>
                  <button type="submit" className="mt-4 w-full bg-green-500 text-white text-xl font-bold py-4 rounded-lg shadow hover:bg-green-600 transition-all">
                    GERAR PIX AGORA
                  </button>
                </form>
              )}

              {/* ESTADO 2: LOADING */}
              {checkoutState === 'loading' && (
                <div className="flex justify-center py-12">
                  <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-green-500"></div>
                </div>
              )}

              {/* ESTADO 3: QR CODE */}
              {checkoutState === 'pix' && pixData && (
                <div className="text-center space-y-6">
                  <div className="bg-gray-100 p-4 rounded-lg inline-block">
                    {/* Se tiver imagem base64 do QR Code, mostramos. Se não, mostramos ícone */}
                    {pixData.qrCodeBase64 ? (
                        <img src={`data:image/png;base64,${pixData.qrCodeBase64}`} alt="QR Code Pix" className="w-48 h-48 mx-auto" />
                    ) : (
                        <QrCodeIcon className="w-48 h-48 text-gray-800 mx-auto" />
                    )}
                  </div>
                  
                  <div>
                    <p className="text-sm text-gray-600 mb-2">Copie o código abaixo e pague no app do seu banco:</p>
                    <div className="flex items-center gap-2">
                      <input 
                        readOnly 
                        value={pixData.copiaECola} 
                        className="w-full bg-gray-100 border border-gray-300 text-gray-500 text-sm rounded-lg p-2.5" 
                      />
                      <button onClick={handleCopyPix} className="bg-blue-500 hover:bg-blue-600 text-white p-2 rounded-lg">
                        <DocumentDuplicateIcon className="w-5 h-5" />
                      </button>
                    </div>
                  </div>

                  <p className="text-xs text-gray-500 mt-4">Após o pagamento, você receberá o acesso no seu email.</p>
                </div>
              )}

              {/* ESTADO 4: SUCESSO */}
              {checkoutState === 'success' && (
                <div className="text-center py-8">
                    <CheckCircleIcon className="w-24 h-24 text-green-500 mx-auto mb-4" />
                    <p className="text-lg text-gray-700">Seu acesso foi enviado para o seu email!</p>
                </div>
              )}

            </div>
          </div>
        </div>
      )}
    </div>
  );
}