import { NextResponse } from 'next/server';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';

// Interface para evitar erro de build
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

    console.log("🚀 Iniciando Scanner V3 (Foco na Paradise)...");

    // ESTRATÉGIAS: Variações da URL da Paradise + X-API-Key
    const strategies: PaymentStrategy[] = [
        {
            name: "1. Paradise API (Com /api/v1)",
            url: "https://api.paradisepags.com/api/v1/gateway/request-qrcode",
            headers: { 'Content-Type': 'application/json', 'X-API-Key': SECRET_KEY }
        },
        {
            name: "2. Paradise .com.br (Com /api/v1)",
            url: "https://api.paradisepags.com.br/api/v1/gateway/request-qrcode",
            headers: { 'Content-Type': 'application/json', 'X-API-Key': SECRET_KEY }
        },
        {
            name: "3. Paradise Direto (Sem api subdomain)",
            url: "https://paradisepags.com/api/v1/gateway/request-qrcode",
            headers: { 'Content-Type': 'application/json', 'X-API-Key': SECRET_KEY }
        },
        {
             // Última tentativa na SuitPay mas com header 'ci' sendo o SECRET (alguns sistemas invertem)
            name: "4. SuitPay (CI = Secret)",
            url: "https://ws.suitpay.app/api/v1/gateway/request-qrcode",
            headers: { 'Content-Type': 'application/json', 'ci': SECRET_KEY, 'cs': SECRET_KEY }
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
            console.log(`   Status: ${res.status}`);

            if (res.ok) {
                try {
                    const json = JSON.parse(text);
                    // Verifica se tem QR Code
                    if (json.paymentCode || json.qrcode_text || json.pix_code) {
                        console.log(`✅ ACHAMOS! Funcionou na: ${strat.name}`);
                        successData = json;
                        break;
                    }
                } catch (e) {}
            }
            logTentativas.push(`${strat.name}: ${res.status}`);
        } catch (e: any) {
            logTentativas.push(`${strat.name}: Erro Rede`);
        }
    }

    if (!successData) {
        return NextResponse.json({ 
            error: 'Falha na conexão.', 
            message: 'Nenhuma URL da Paradise aceitou a chave. Verifique se sua conta Paradise está ativa para API.',
            logs: logTentativas 
        }, { status: 502 });
    }

    // SUCESSO
    const data = successData as any;
    const pixCopiaCola = data.paymentCode || data.pix_code || data.qrcode_text;
    const qrCodeImage = data.paymentCodeBase64 || data.qrcode_image;
    const finalId = data.idTransaction || transactionId;

    await setDoc(doc(db, "transactions", String(finalId)), {
        status: 'created',
        provider: 'paradise_v3',
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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
