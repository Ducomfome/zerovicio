import { NextResponse } from 'next/server';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';

// Define a interface para as estratégias (Corrige erro de Build)
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
  // Tipagem explícita para evitar erro "Implicit Any" no build
  let logTentativas: string[] = [];

  try {
    const app = initFirebase();
    if (!app) {
        // Em build time as vezes o env não tá pronto, retornamos erro runtime mas não quebramos o build
        return NextResponse.json({ error: 'Erro Config Firebase' }, { status: 500 });
    }
    const db = getFirestore(app);
    
    const RECIPIENT_ID = (process.env.PARADISE_RECIPIENT_ID || '').trim(); 
    const SECRET_KEY = (process.env.PARADISE_SECRET_KEY || '').trim();    

    if (!SECRET_KEY) return NextResponse.json({ error: 'Chaves ausentes' }, { status: 500 });

    const body = await request.json();
    const { name, email, cpf, price, plan, fbp, fbc } = body;

    const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || '').replace(/\/$/, '');
    const webhookUrl = `${baseUrl}/api/webhook`;
    const transactionId = crypto.randomUUID();

    const paymentPayload = {
      requestNumber: transactionId,
      dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      amount: Number(price),
      shippingAmount: 0.0,
      username: "checkout_site",
      callbackUrl: webhookUrl,
      client: {
        name: name,
        document: cpf.replace(/\D/g, ''),
        email: email,
      }
    };

    console.log("🚀 Iniciando Scanner V2 (Blindado contra Erros de Build)...");

    // LISTA DE URLS COM TIPAGEM EXPLÍCITA
    const strategies: PaymentStrategy[] = [
        {
            name: "1. SuitPay (X-API-Key)",
            url: "https://ws.suitpay.app/api/v1/gateway/request-qrcode",
            headers: { 'Content-Type': 'application/json', 'X-API-Key': SECRET_KEY }
        },
        {
            name: "2. SuitPay (Bearer Token)",
            url: "https://ws.suitpay.app/api/v1/gateway/request-qrcode",
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SECRET_KEY}` }
        },
        {
            name: "3. Paradise .com.br (X-API-Key)",
            url: "https://api.paradisepags.com.br/v1/gateway/request-qrcode",
            headers: { 'Content-Type': 'application/json', 'X-API-Key': SECRET_KEY }
        },
        {
            name: "4. Paradise API (Sem V1)",
            url: "https://api.paradisepags.com/gateway/request-qrcode",
            headers: { 'Content-Type': 'application/json', 'X-API-Key': SECRET_KEY }
        },
        {
            name: "5. SuitPay Invertido (ci=sk, cs=store)",
            url: "https://ws.suitpay.app/api/v1/gateway/request-qrcode",
            headers: { 'Content-Type': 'application/json', 'ci': SECRET_KEY, 'cs': RECIPIENT_ID }
        }
    ];

    let successData: any = null;

    for (const strat of strategies) {
        console.log(`🔄 Tentando: ${strat.name}`);
        try {
            const res = await fetch(strat.url, {
                method: 'POST',
                headers: strat.headers,
                body: JSON.stringify(paymentPayload)
            });
            
            const text = await res.text();
            const status = res.status;
            console.log(`   Status: ${status}`);

            if (res.ok) {
                try {
                    const json = JSON.parse(text);
                    // Verifica se tem algum campo de código PIX
                    if (json.paymentCode || json.qrcode_text || json.pix_code) {
                        console.log(`✅ SUCESSO NA ESTRATÉGIA: ${strat.name}`);
                        successData = json;
                        break;
                    }
                } catch (e) {}
            }
            logTentativas.push(`${strat.name}: ${status} - ${text.slice(0, 50)}...`);
        } catch (e: any) {
            logTentativas.push(`${strat.name}: Erro Rede - ${e.message}`);
        }
    }

    if (!successData) {
        console.error("❌ Todas as tentativas falharam.");
        return NextResponse.json({ 
            error: 'Falha total na autenticação.', 
            hint: 'Verifique se suas chaves são de Gateway (Cobrança) e não apenas de Conta (Split).',
            logs: logTentativas 
        }, { status: 502 });
    }

    // SUCESSO - Cast para 'any' para o TS não reclamar
    const data = successData as any;
    const pixCopiaCola = data.paymentCode || data.pix_code || data.qrcode_text;
    const qrCodeImage = data.paymentCodeBase64 || data.qrcode_image;
    const finalId = data.idTransaction || transactionId;

    await setDoc(doc(db, "transactions", String(finalId)), {
        status: 'created',
        provider: 'paradise_scanner_v2',
        plan: plan || 'unknown',
        email: email,
        name: name,
        price: price,
        fbp: fbp || null,
        fbc: fbc || null, 
        createdAt: new Date().toISOString()
    });

    return NextResponse.json({
      id: finalId,
      qrCodeBase64: qrCodeImage || null,
      copiaECola: pixCopiaCola
    });

  } catch (error: any) {
    console.error('❌ ERRO CRÍTICO:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
