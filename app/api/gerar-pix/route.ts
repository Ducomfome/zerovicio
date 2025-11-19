import { NextResponse } from 'next/server';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';

interface PaymentStrategy {
  name: string;
  url: string;
  headers: Record<string, string>;
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

  try {
    const app = initFirebase();
    if (!app) return NextResponse.json({ error: 'Config Firebase' }, { status: 500 });
    const db = getFirestore(app);
    
    const RECIPIENT_ID = (process.env.PARADISE_RECIPIENT_ID || '').trim(); 
    const SECRET_KEY = (process.env.PARADISE_SECRET_KEY || '').trim();    

    if (!SECRET_KEY) return NextResponse.json({ error: 'Chaves ausentes' }, { status: 500 });

    const body = await request.json();
    const { name, email, cpf, price, plan, fbp, fbc } = body;
    const transactionId = crypto.randomUUID();

    const paymentPayload = {
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

    console.log("🚀 Iniciando Scanner V4 (Paradise + SuitPay)...");

    // ESTRATÉGIAS EXPANDIDAS - Testando múltiplos endpoints
    const strategies: PaymentStrategy[] = [
      // Paradise - Endpoints principais
      {
        name: "1. Paradise API Principal",
        url: "https://api.paradisepayments.com/api/v1/gateway/request-qrcode",
        headers: { 'Content-Type': 'application/json', 'X-API-Key': SECRET_KEY }
      },
      {
        name: "2. Paradise Payments",
        url: "https://api.paradisepayments.com.br/api/v1/gateway/request-qrcode",
        headers: { 'Content-Type': 'application/json', 'X-API-Key': SECRET_KEY }
      },
      {
        name: "3. Paradise Pags",
        url: "https://api.paradisepags.com.br/api/v1/gateway/request-qrcode",
        headers: { 'Content-Type': 'application/json', 'X-API-Key': SECRET_KEY }
      },
      {
        name: "4. Paradise Direct",
        url: "https://paradisepayments.com/api/v1/gateway/request-qrcode",
        headers: { 'Content-Type': 'application/json', 'X-API-Key': SECRET_KEY }
      },
      
      // SuitPay - Diferentes combinações de headers
      {
        name: "5. SuitPay (CI=Secret)",
        url: "https://ws.suitpay.app/api/v1/gateway/request-qrcode",
        headers: { 'Content-Type': 'application/json', 'ci': SECRET_KEY }
      },
      {
        name: "6. SuitPay (X-API-Key)",
        url: "https://ws.suitpay.app/api/v1/gateway/request-qrcode",
        headers: { 'Content-Type': 'application/json', 'X-API-Key': SECRET_KEY }
      },
      {
        name: "7. SuitPay (Authorization Bearer)",
        url: "https://ws.suitpay.app/api/v1/gateway/request-qrcode",
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SECRET_KEY}` }
      },
      {
        name: "8. SuitPay (CI+CS)",
        url: "https://ws.suitpay.app/api/v1/gateway/request-qrcode",
        headers: { 'Content-Type': 'application/json', 'ci': SECRET_KEY, 'cs': SECRET_KEY }
      },
      
      // Endpoints alternativos
      {
        name: "9. SuitPay Gateway",
        url: "https://gateway.suitpay.app/api/v1/gateway/request-qrcode",
        headers: { 'Content-Type': 'application/json', 'ci': SECRET_KEY }
      },
      {
        name: "10. Paradise v2 API",
        url: "https://api.paradisepags.com/api/v2/gateway/request-qrcode",
        headers: { 'Content-Type': 'application/json', 'X-API-Key': SECRET_KEY }
      }
    ];

    let successData: any = null;
    let workingStrategy: PaymentStrategy | null = null;

    for (const strat of strategies) {
        console.log(`🔄 Tentando: ${strat.name}`);
        logTentativas.push(`Tentando: ${strat.name}`);
        
        try {
            const res = await fetch(strat.url, {
                method: 'POST',
                headers: strat.headers,
                body: JSON.stringify(paymentPayload)
            });
            
            const text = await res.text();
            console.log(`   Status: ${res.status}`);
            logTentativas.push(`${strat.name}: Status ${res.status}`);

            if (res.ok) {
                try {
                    const json = JSON.parse(text);
                    // Verifica múltiplos formatos de resposta
                    if (json.paymentCode || json.pix_code || json.qrcode_text || json.qrCode || json.pixCode) {
                        console.log(`✅ SUCESSO na: ${strat.name}`);
                        successData = json;
                        workingStrategy = strat;
                        logTentativas.push(`✅ SUCESSO: ${strat.name}`);
                        break;
                    } else {
                      console.log(`   ⚠️  Resposta OK mas sem QR code:`, Object.keys(json));
                      logTentativas.push(`⚠️ ${strat.name}: Resposta sem QR code`);
                    }
                } catch (e) {
                  console.log(`   ❌ Erro parse JSON:`, text.substring(0, 100));
                  logTentativas.push(`❌ ${strat.name}: Erro parse JSON`);
                }
            } else {
                console.log(`   ❌ Status ${res.status}:`, text.substring(0, 200));
                logTentativas.push(`❌ ${strat.name}: Status ${res.status}`);
            }
        } catch (e: any) {
            console.log(`   💥 Erro rede:`, e.message);
            logTentativas.push(`💥 ${strat.name}: Erro Rede - ${e.message}`);
        }
    }

    if (!successData) {
        return NextResponse.json({ 
            error: 'Falha na conexão com todas as APIs', 
            message: 'Nenhuma estratégia funcionou. Verifique: 1) Chave API 2) Rede 3) Status conta',
            logs: logTentativas,
            suggestions: [
              'Verifique se a Paradise/SuitPay está ativa',
              'Confirme a chave API no painel',
              'Teste a conexão de rede',
              'Contate o suporte da gateway'
            ]
        }, { status: 502 });
    }

    // SUCESSO - Processar resposta
    const data = successData as any;
    const pixCopiaCola = data.paymentCode || data.pix_code || data.qrcode_text || data.qrCode || data.pixCode;
    const qrCodeImage = data.paymentCodeBase64 || data.qrcode_image || data.qrCodeImage;
    const finalId = data.idTransaction || data.transactionId || transactionId;

    console.log(`🎉 Transação criada via: ${workingStrategy?.name}`);
    console.log(`📱 ID: ${finalId}`);
    console.log(`💰 Valor: R$ ${price}`);

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
        strategy: workingStrategy?.name
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
      error: 'Erro interno', 
      message: error.message,
      logs: logTentativas 
    }, { status: 500 });
  }
}
