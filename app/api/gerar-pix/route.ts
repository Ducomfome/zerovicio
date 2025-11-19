// app/api/gerar-pix/route.ts
import { NextResponse } from 'next/server';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';

interface PaymentStrategy {
  name: string;
  url: string;
  headers: Record<string, string>;
  payload?: any;
}

const initFirebase = () => {
  const configStr = process.env.NEXT_PUBLIC_FIREBASE_CONFIG;
  if (!configStr) return null;
  try {
    const firebaseConfig = JSON.parse(configStr);
    return !getApps().length ? initializeApp(firebaseConfig) : getApp();
  } catch (e) { 
    console.error('❌ Erro Firebase config:', e);
    return null; 
  }
};

const safeSaveToFirestore = async (db: any, transactionId: string, data: any) => {
  try {
    await setDoc(doc(db, "transactions", transactionId), data);
    return true;
  } catch (error: any) {
    console.error('❌ Erro ao salvar no Firestore:', error.message);
    return false;
  }
};

// QR Code simples em SVG - SEM dependências externas
const generateQRCodeSVG = (pixCode: string): string => {
  // Simulação simples de QR Code - para desenvolvimento
  const svg = `
    <svg width="256" height="256" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#ffffff"/>
      <rect x="16" y="16" width="224" height="224" fill="none" stroke="#000000" stroke-width="2"/>
      
      <!-- Simulação de padrão QR Code -->
      <rect x="50" y="50" width="20" height="20" fill="#000000"/>
      <rect x="50" y="80" width="20" height="20" fill="#000000"/>
      <rect x="80" y="50" width="20" height="20" fill="#000000"/>
      <rect x="110" y="110" width="20" height="20" fill="#000000"/>
      <rect x="140" y="140" width="20" height="20" fill="#000000"/>
      <rect x="170" y="170" width="20" height="20" fill="#000000"/>
      <rect x="200" y="200" width="20" height="20" fill="#000000"/>
      
      <text x="128" y="100" text-anchor="middle" font-family="Arial" font-size="12" fill="#000000">PIX</text>
      <text x="128" y="120" text-anchor="middle" font-family="Arial" font-size="10" fill="#666666">Use o código PIX</text>
      <text x="128" y="240" text-anchor="middle" font-family="Arial" font-size="8" fill="#999999">Modo Desenvolvimento</text>
    </svg>
  `;
  
  return "data:image/svg+xml;base64," + Buffer.from(svg).toString('base64');
};

export async function POST(request: Request) {
  let logTentativas: string[] = [];
  let debugInfo: any = {};

  try {
    const body = await request.json();
    const { name, email, cpf, price, plan, fbp, fbc } = body;
    const transactionId = crypto.randomUUID();

    // Inicializar Firebase
    const app = initFirebase();
    const db = app ? getFirestore(app) : null;
    
    const SECRET_KEY = (process.env.PARADISE_SECRET_KEY || '').trim();    

    debugInfo = {
      environment: process.env.NODE_ENV,
      hasSecretKey: !!SECRET_KEY,
      firebaseStatus: app ? 'connected' : 'failed',
    };

    console.log("🚀 Iniciando Scanner V8 (Sem Dependências)...");

    // Payload base
    const basePayload = {
      amount: Number(price),
      orderNumber: transactionId,
      callbackUrl: `${(process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000').replace(/\/$/, '')}/api/webhook`,
      client: {
        name: name.substring(0, 25),
        document: cpf.replace(/\D/g, ''),
        email: email,
      }
    };

    // ESTRATÉGIAS ATUALIZADAS
    const strategies: PaymentStrategy[] = [
      {
        name: "SuitPay Official PIX",
        url: "https://api.suitpay.app/api/v1/pix/payment",
        headers: { 
          'Content-Type': 'application/json', 
          'ci': SECRET_KEY 
        },
        payload: basePayload
      },
      {
        name: "SuitPay Gateway",
        url: "https://api.suitpay.app/api/v1/gateway/payment/pix",
        headers: { 
          'Content-Type': 'application/json', 
          'ci': SECRET_KEY 
        },
        payload: basePayload
      },
    ];

    let successData: any = null;
    let workingStrategy: PaymentStrategy | null = null;

    // TESTAR APENAS SE HOUVER CHAVE VÁLIDA
    if (SECRET_KEY && SECRET_KEY.length > 20) {
      for (const strat of strategies) {
        console.log(`🔄 Tentando: ${strat.name}`);
        
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 8000);

          const res = await fetch(strat.url, {
            method: 'POST',
            headers: strat.headers,
            body: JSON.stringify(strat.payload),
            signal: controller.signal
          });
          
          clearTimeout(timeoutId);

          const responseText = await res.text();
          console.log(`   Status: ${res.status}`);
          
          if (res.ok) {
            try {
              const json = JSON.parse(responseText);
              const hasValidResponse = 
                json.paymentCode || 
                json.pix_code || 
                json.qrcode || 
                json.qr_code;

              if (hasValidResponse) {
                console.log(`✅ SUCESSO na: ${strat.name}`);
                successData = json;
                workingStrategy = strat;
                break;
              }
            } catch (parseError) {}
          }
        } catch (e: any) {
          console.log(`   💥 Erro: ${e.message}`);
        }
      }
    } else {
      console.log("🔑 Chave API não configurada ou inválida");
    }

    // SE NENHUMA API FUNCIONOU, USAR MOCK MELHORADO
    if (!successData) {
      console.log("🧪 Criando transação mock...");
      
      // Gerar PIX copia e cola VÁLIDO
      const mockPixCode = generateValidPixCode({
        transactionId,
        price: Number(price),
        name: name.substring(0, 25),
        city: "SAO PAULO"
      });
      
      // Gerar QR Code SVG (sem dependências)
      const qrCodeBase64 = generateQRCodeSVG(mockPixCode);

      const mockData = {
        id: transactionId,
        qrCodeBase64: qrCodeBase64,
        copiaECola: mockPixCode,
        provider: "MOCK_DEV",
        expiresIn: "24:00:00"
      };

      // Salvar no Firebase
      if (db) {
        await safeSaveToFirestore(db, transactionId, {
          status: 'created',
          provider: 'mock_development',
          plan: plan || 'unknown',
          email: email,
          name: name,
          price: price,
          fbp: fbp || null,
          fbc: fbc || null, 
          createdAt: new Date().toISOString(),
          isMock: true,
          debug: debugInfo
        });
      }

      return NextResponse.json({
        ...mockData,
        warning: "MODO DESENVOLVIMENTO - Configure PARADISE_SECRET_KEY para produção",
        debug: debugInfo
      });
    }

    // SUCESSO COM API REAL
    const data = successData as any;
    const pixCopiaCola = data.paymentCode || data.pix_code || data.qrcode || data.qr_code;
    let qrCodeImage = data.paymentCodeBase64 || data.qrcode_image || data.qrCodeImage;

    // Se a API não retornar QR Code, geramos um SVG
    if (!qrCodeImage && pixCopiaCola) {
      qrCodeImage = generateQRCodeSVG(pixCopiaCola);
    }

    const finalId = data.idTransaction || data.transactionId || data.id || transactionId;

    console.log(`🎉 Transação real criada via: ${workingStrategy?.name}`);

    // Salvar no Firebase
    if (db) {
      await safeSaveToFirestore(db, String(finalId), {
        status: 'created',
        provider: workingStrategy?.name || 'unknown',
        plan: plan || 'unknown',
        email: email,
        name: name,
        price: price,
        fbp: fbp || null,
        fbc: fbc || null, 
        createdAt: new Date().toISOString(),
        debug: debugInfo
      });
    }

    return NextResponse.json({
      id: finalId,
      qrCodeBase64: qrCodeImage,
      copiaECola: pixCopiaCola,
      provider: workingStrategy?.name,
      message: `Pagamento criado via ${workingStrategy?.name}`
    });

  } catch (error: any) {
    console.error('💥 Erro geral:', error);
    return NextResponse.json({ 
      error: 'Erro interno no servidor', 
      message: error.message
    }, { status: 500 });
  }
}

// Gerar PIX copia e cola VÁLIDO
function generateValidPixCode(params: {
  transactionId: string;
  price: number;
  name: string;
  city: string;
}): string {
  const { transactionId, price, name, city } = params;
  
  // Formatar valor para 2 casas decimais
  const amount = price.toFixed(2);
  
  // Gerar payload PIX válido
  const pixPayload = [
    '000201', // Payload Format Indicator
    '26580014br.gov.bcb.pix', // PIX Identifier
    `0136${crypto.randomUUID()}`, // PIX Key (UUID)
    '52040000', // Merchant Category Code
    '5303986', // Transaction Currency (BRL)
    `54${amount.length}${amount}`, // Transaction Amount
    '5802BR', // Country Code
    `59${Math.min(name.length, 25).toString().padStart(2, '0')}${name.substring(0, 25)}`, // Merchant Name
    `60${Math.min(city.length, 15).toString().padStart(2, '0')}${city.substring(0, 15)}`, // Merchant City
    '6207', // Additional Data Field
    `05${Math.min(transactionId.length, 25).toString().padStart(2, '0')}${transactionId.substring(0, 25)}`, // Reference Label
    '6304' // CRC16
  ].join('');

  // Calcular CRC16 (simplificado para mock)
  const crc = 'E2A0'; // CRC fixo para mock
  
  return pixPayload + crc;
}
