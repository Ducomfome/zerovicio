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
  } catch (e) { return null; }
};

export async function POST(request: Request) {
  let logTentativas: string[] = [];
  let debugInfo: any = {};

  try {
    const app = initFirebase();
    if (!app) return NextResponse.json({ error: 'Config Firebase' }, { status: 500 });
    const db = getFirestore(app);
    
    const RECIPIENT_ID = (process.env.PARADISE_RECIPIENT_ID || '').trim(); 
    const SECRET_KEY = (process.env.PARADISE_SECRET_KEY || '').trim();    

    // DEBUG: Verificar se as variáveis de ambiente estão carregando
    debugInfo = {
      hasSecretKey: !!SECRET_KEY,
      secretKeyLength: SECRET_KEY.length,
      secretKeyPreview: SECRET_KEY ? `${SECRET_KEY.substring(0, 10)}...` : 'vazia',
      hasRecipientId: !!RECIPIENT_ID,
      recipientId: RECIPIENT_ID
    };

    if (!SECRET_KEY) {
      return NextResponse.json({ 
        error: 'Chave API não configurada', 
        debug: debugInfo 
      }, { status: 500 });
    }

    const body = await request.json();
    const { name, email, cpf, price, plan, fbp, fbc } = body;
    const transactionId = crypto.randomUUID();

    // Payload base para Paradise
    const paradisePayload = {
      requestNumber: transactionId,
      dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      amount: Number(price),
      shippingAmount: 0.0,
      username: "checkout_site",
      callbackUrl: `${(process.env.NEXT_PUBLIC_BASE_URL || '').replace(/\/$/, '')}/api/webhook`,
      client: {
        name: name,
        document: cpf.replace(/\D/g, ''),
        email: email,
      }
    };

    // Payload alternativo para SuitPay
    const suitpayPayload = {
      amount: Number(price),
      orderNumber: transactionId,
      callbackUrl: `${(process.env.NEXT_PUBLIC_BASE_URL || '').replace(/\/$/, '')}/api/webhook`,
      client: {
        name: name,
        document: cpf.replace(/\D/g, ''),
        email: email,
      }
    };

    console.log("🚀 Iniciando Scanner V5 (Diagnóstico Completo)...");

    // ESTRATÉGIAS COM DIAGNÓSTICO DETALHADO
    const strategies: PaymentStrategy[] = [
      // Paradise - Testando diferentes formatos
      {
        name: "Paradise Payments BR",
        url: "https://api.paradisepayments.com.br/api/v1/gateway/request-qrcode",
        headers: { 
          'Content-Type': 'application/json', 
          'X-API-Key': SECRET_KEY 
        },
        payload: paradisePayload
      },
      {
        name: "Paradise Pags BR",
        url: "https://api.paradisepags.com.br/api/v1/gateway/request-qrcode",
        headers: { 
          'Content-Type': 'application/json', 
          'X-API-Key': SECRET_KEY 
        },
        payload: paradisePayload
      },
      {
        name: "Paradise Global",
        url: "https://api.paradisepayments.com/api/v1/gateway/request-qrcode",
        headers: { 
          'Content-Type': 'application/json', 
          'X-API-Key': SECRET_KEY 
        },
        payload: paradisePayload
      },
      
      // SuitPay - Com diferentes métodos de autenticação
      {
        name: "SuitPay CI Only",
        url: "https://ws.suitpay.app/api/v1/gateway/request-qrcode",
        headers: { 
          'Content-Type': 'application/json', 
          'ci': SECRET_KEY 
        },
        payload: suitpayPayload
      },
      {
        name: "SuitPay CI+CS Same",
        url: "https://ws.suitpay.app/api/v1/gateway/request-qrcode",
        headers: { 
          'Content-Type': 'application/json', 
          'ci': SECRET_KEY,
          'cs': SECRET_KEY 
        },
        payload: suitpayPayload
      },
      {
        name: "SuitPay Auth Bearer",
        url: "https://ws.suitpay.app/api/v1/gateway/request-qrcode",
        headers: { 
          'Content-Type': 'application/json', 
          'Authorization': `Bearer ${SECRET_KEY}`
        },
        payload: suitpayPayload
      },
      
      // Fallback - Testando endpoints alternativos
      {
        name: "SuitPay Gateway v2",
        url: "https://gateway.suitpay.app/api/v2/gateway/pix",
        headers: { 
          'Content-Type': 'application/json', 
          'ci': SECRET_KEY 
        },
        payload: suitpayPayload
      },
      {
        name: "Paradise Direct Pix",
        url: "https://paradisepayments.com/api/v1/pix/payment",
        headers: { 
          'Content-Type': 'application/json', 
          'X-API-Key': SECRET_KEY 
        },
        payload: paradisePayload
      }
    ];

    let successData: any = null;
    let workingStrategy: PaymentStrategy | null = null;

    for (const strat of strategies) {
        console.log(`🔄 Tentando: ${strat.name}`);
        logTentativas.push(`Tentando: ${strat.name}`);
        
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

            const res = await fetch(strat.url, {
                method: 'POST',
                headers: strat.headers,
                body: JSON.stringify(strat.payload),
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);

            const text = await res.text();
            console.log(`   Status: ${res.status}`);
            
            let responseInfo = {
                strategy: strat.name,
                status: res.status,
                headers: Object.fromEntries(res.headers),
                responsePreview: text.substring(0, 200)
            };

            logTentativas.push(JSON.stringify(responseInfo));

            if (res.ok) {
                try {
                    const json = JSON.parse(text);
                    // Verifica múltiplos formatos de resposta
                    const hasValidResponse = 
                        json.paymentCode || 
                        json.pix_code || 
                        json.qrcode_text || 
                        json.qrCode || 
                        json.pixCode ||
                        json.qr_code ||
                        (json.data && (json.data.pix_code || json.data.qrcode));

                    if (hasValidResponse) {
                        console.log(`✅ SUCESSO na: ${strat.name}`);
                        successData = json;
                        workingStrategy = strat;
                        break;
                    } else {
                        console.log(`   ⚠️  Resposta OK mas formato inesperado:`, Object.keys(json));
                    }
                } catch (e) {
                    console.log(`   ❌ Erro parse JSON:`, text.substring(0, 100));
                }
            } else {
                console.log(`   ❌ Status ${res.status}:`, text.substring(0, 200));
            }
        } catch (e: any) {
            if (e.name === 'AbortError') {
                console.log(`   ⏰ Timeout: ${strat.name}`);
                logTentativas.push(`⏰ ${strat.name}: Timeout`);
            } else {
                console.log(`   💥 Erro rede:`, e.message);
                logTentativas.push(`💥 ${strat.name}: ${e.message}`);
            }
        }
    }

    // SE NENHUMA ESTRATÉGIA FUNCIONOU, TENTAR MOCK PARA DESENVOLVIMENTO
    if (!successData) {
      console.log("🧪 Nenhuma API funcionou, criando mock para desenvolvimento...");
      
      // Mock para desenvolvimento - REMOVER EM PRODUÇÃO
      const mockPixCode = `00020126580014br.gov.bcb.pix0136${crypto.randomUUID()}5204000053039865406${price.toFixed(2)}5802BR5913TESTE MERCHANT6008SAO PAULO62290525${transactionId}6304E2A0`;
      
      const mockData = {
        id: transactionId,
        qrCodeBase64: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
        copiaECola: mockPixCode,
        provider: "MOCK_DEV",
        message: "Modo desenvolvimento - Configure as APIs reais para produção"
      };

      // Salvar no Firebase mesmo sendo mock
      await setDoc(doc(db, "transactions", transactionId), {
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

      return NextResponse.json({
        ...mockData,
        warning: "MOCK MODE - Configure suas chaves API para produção",
        debug: debugInfo,
        logs: logTentativas
      });
    }

    // SUCESSO COM API REAL
    const data = successData as any;
    const pixCopiaCola = data.paymentCode || data.pix_code || data.qrcode_text || data.qrCode || data.pixCode || data.qr_code;
    const qrCodeImage = data.paymentCodeBase64 || data.qrcode_image || data.qrCodeImage || data.base64;
    const finalId = data.idTransaction || data.transactionId || data.id || transactionId;

    console.log(`🎉 Transação criada via: ${workingStrategy?.name}`);
    console.log(`📱 ID: ${finalId}`);

    await setDoc(doc(db, "transactions", String(finalId)), {
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

    return NextResponse.json({
      id: finalId,
      qrCodeBase64: qrCodeImage || null,
      copiaECola: pixCopiaCola,
      provider: workingStrategy?.name,
      message: `Criado via ${workingStrategy?.name}`
    });

  } catch (error: any) {
    console.error('💥 Erro geral:', error);
    return NextResponse.json({ 
      error: 'Erro interno no servidor', 
      message: error.message,
      debug: debugInfo,
      logs: logTentativas 
    }, { status: 500 });
  }
}
