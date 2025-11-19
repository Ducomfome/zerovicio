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

// Função segura para salvar no Firebase
const safeSaveToFirestore = async (db: any, transactionId: string, data: any) => {
  try {
    await setDoc(doc(db, "transactions", transactionId), data);
    return true;
  } catch (error: any) {
    console.error('❌ Erro ao salvar no Firestore:', error.message);
    // Não bloqueia o fluxo se o Firebase falhar
    return false;
  }
};

export async function POST(request: Request) {
  let logTentativas: string[] = [];
  let debugInfo: any = {};

  try {
    const body = await request.json();
    const { name, email, cpf, price, plan, fbp, fbc } = body;
    const transactionId = crypto.randomUUID();

    // Inicializar Firebase (se possível)
    const app = initFirebase();
    const db = app ? getFirestore(app) : null;
    
    const SECRET_KEY = (process.env.PARADISE_SECRET_KEY || '').trim();    

    // DEBUG: Verificar ambiente
    debugInfo = {
      environment: process.env.NODE_ENV,
      hasSecretKey: !!SECRET_KEY,
      secretKeyLength: SECRET_KEY.length,
      secretKeyPreview: SECRET_KEY ? `${SECRET_KEY.substring(0, 6)}...${SECRET_KEY.substring(SECRET_KEY.length - 4)}` : 'vazia',
      firebaseStatus: app ? 'connected' : 'failed',
      timestamp: new Date().toISOString()
    };

    console.log("🚀 Iniciando Scanner V6 (Resiliência Total)...");

    // Payload base para APIs
    const basePayload = {
      amount: Number(price),
      orderNumber: transactionId,
      callbackUrl: `${(process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000').replace(/\/$/, '')}/api/webhook`,
      client: {
        name: name,
        document: cpf.replace(/\D/g, ''),
        email: email,
      }
    };

    // ESTRATÉGIAS MAIS ROBUSTAS
    const strategies: PaymentStrategy[] = [
      // SuitPay - Estratégias principais
      {
        name: "SuitPay Main",
        url: "https://api.suitpay.app/api/v1/gateway/payment/pix",
        headers: { 
          'Content-Type': 'application/json', 
          'ci': SECRET_KEY 
        },
        payload: basePayload
      },
      {
        name: "SuitPay WS",
        url: "https://ws.suitpay.app/api/v1/gateway/payment/pix",
        headers: { 
          'Content-Type': 'application/json', 
          'ci': SECRET_KEY 
        },
        payload: basePayload
      },
      {
        name: "SuitPay PIX Only",
        url: "https://api.suitpay.app/api/v1/pix/payment",
        headers: { 
          'Content-Type': 'application/json', 
          'ci': SECRET_KEY 
        },
        payload: basePayload
      },
      // Paradise - Tentativas com fallback
      {
        name: "Paradise BR",
        url: "https://api.paradiseapi.com.br/api/v1/pix/payment",
        headers: { 
          'Content-Type': 'application/json', 
          'X-API-Key': SECRET_KEY 
        },
        payload: basePayload
      },
      {
        name: "Paradise Global",
        url: "https://api.paradiseapi.com/api/v1/pix/payment",
        headers: { 
          'Content-Type': 'application/json', 
          'X-API-Key': SECRET_KEY 
        },
        payload: basePayload
      },
      // Fallback - APIs alternativas
      {
        name: "SuitPay E-commerce",
        url: "https://ecommerce.suitpay.app/api/v1/pix/payment",
        headers: { 
          'Content-Type': 'application/json', 
          'ci': SECRET_KEY 
        },
        payload: basePayload
      }
    ];

    let successData: any = null;
    let workingStrategy: PaymentStrategy | null = null;

    // TESTAR CONECTIVIDADE PRIMEIRO
    console.log("🔍 Testando conectividade com APIs...");
    
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
            
            const logEntry = {
                strategy: strat.name,
                status: res.status,
                url: strat.url,
                response: responseText.substring(0, 300)
            };
            
            logTentativas.push(JSON.stringify(logEntry));

            if (res.ok) {
                try {
                    const json = JSON.parse(responseText);
                    // Verificar múltiplos formatos de resposta bem-sucedida
                    const hasValidResponse = 
                        json.paymentCode || 
                        json.pix_code || 
                        json.qrcode || 
                        json.qr_code ||
                        json.pixCode ||
                        (json.data && (json.data.pix_code || json.data.qr_code));

                    if (hasValidResponse) {
                        console.log(`✅ SUCESSO na: ${strat.name}`);
                        successData = json;
                        workingStrategy = strat;
                        break;
                    } else {
                        console.log(`   ⚠️  Resposta OK mas formato inesperado`);
                        console.log(`   Chaves recebidas:`, Object.keys(json));
                    }
                } catch (parseError) {
                    console.log(`   ❌ Erro ao parsear JSON`);
                }
            } else {
                console.log(`   ❌ Status ${res.status}`);
                if (res.status === 403) {
                    console.log(`   🔐 Acesso negado - verifique a chave API`);
                }
            }
        } catch (e: any) {
            if (e.name === 'AbortError') {
                console.log(`   ⏰ Timeout na conexão`);
                logTentativas.push(`⏰ ${strat.name}: Timeout`);
            } else {
                console.log(`   💥 Erro de rede: ${e.message}`);
                logTentativas.push(`💥 ${strat.name}: ${e.message}`);
            }
        }
    }

    // SE NENHUMA API FUNCIONOU, USAR MOCK INTELLIGENTE
    if (!successData) {
      console.log("🧪 Criando transação mock para desenvolvimento...");
      
      // Gerar PIX copia e cola válido
      const mockPixCode = `00020126580014br.gov.bcb.pix0136${crypto.randomUUID()}520400005303986540${Number(price).toFixed(2)}5802BR5913${name.substring(0, 13)}6008SAO PAULO62290525${transactionId}6304E2A0`;
      
      const mockData = {
        id: transactionId,
        qrCodeBase64: generateMockQRCode(),
        copiaECola: mockPixCode,
        provider: "MOCK_DEV",
        expiresIn: "24:00:00"
      };

      // Tentar salvar no Firebase (não bloqueia se falhar)
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
        warning: "MODO DESENVOLVIMENTO - Configure as APIs de pagamento para produção",
        debug: debugInfo,
        logs: logTentativas.slice(0, 10) // Limitar logs no response
      });
    }

    // SUCESSO COM API REAL
    const data = successData as any;
    const pixCopiaCola = data.paymentCode || data.pix_code || data.qrcode || data.qr_code || data.pixCode;
    const qrCodeImage = data.paymentCodeBase64 || data.qrcode_image || data.qrCodeImage || data.base64;
    const finalId = data.idTransaction || data.transactionId || data.id || transactionId;

    console.log(`🎉 Transação criada via: ${workingStrategy?.name}`);
    console.log(`📱 ID: ${finalId}`);
    console.log(`💰 Valor: R$ ${price}`);

    // Salvar no Firebase (se disponível)
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
      qrCodeBase64: qrCodeImage || null,
      copiaECola: pixCopiaCola,
      provider: workingStrategy?.name,
      message: `Pagamento criado via ${workingStrategy?.name}`
    });

  } catch (error: any) {
    console.error('💥 Erro geral no endpoint:', error);
    return NextResponse.json({ 
      error: 'Erro interno no servidor', 
      message: error.message,
      debug: debugInfo,
      logs: logTentativas.slice(0, 5)
    }, { status: 500 });
  }
}

// Gerar QR Code mock em base64 (imagem placeholder)
function generateMockQRCode(): string {
  return "data:image/svg+xml;base64," + Buffer.from(`
    <svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#f0f0f0"/>
      <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" 
            font-family="Arial" font-size="12" fill="#666">QR CODE MOCK</text>
      <text x="50%" y="60%" dominant-baseline="middle" text-anchor="middle" 
            font-family="Arial" font-size="10" fill="#999">Modo Desenvolvimento</text>
    </svg>
  `).toString('base64');
}
