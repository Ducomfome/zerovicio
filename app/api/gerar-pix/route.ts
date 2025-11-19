import { NextResponse } from 'next/server';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';

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
    if (!app) return NextResponse.json({ error: 'Erro Config Firebase' }, { status: 500 });
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

    console.log("🚀 Iniciando Scanner V2 de URLs...");

    // LISTA DE URLS PROVÁVEIS
    const strategies = [
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
             // Tenta usar ci/cs mas com os valores trocados (vai que...)
            name: "5. SuitPay Invertido (ci=sk, cs=store)",
            url: "https://ws.suitpay.app/api/v1/gateway/request-qrcode",
            headers: { 'Content-Type': 'application/json', 'ci': SECRET_KEY, 'cs': RECIPIENT_ID }
        }
    ];

    let successData = null;

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
        console.error("❌ Todas falharam.");
        return NextResponse.json({ 
            error: 'Não foi possível autenticar em nenhuma URL.', 
            hint: 'Verifique no painel se existe uma aba "Gateway" ou "Integração" com chaves diferentes (Client ID / Client Secret). As chaves atuais parecem ser apenas de recebedor.',
            logs: logTentativas 
        }, { status: 502 });
    }

    // SUCESSO
    const data = successData;
    const pixCopiaCola = (data as any).paymentCode || (data as any).pix_code || (data as any).qrcode_text;
    const qrCodeImage = (data as any).paymentCodeBase64 || (data as any).qrcode_image;
    const finalId = (data as any).idTransaction || transactionId;

    await setDoc(doc(db, "transactions", String(finalId)), {
        status: 'created',
        provider: 'paradise_scanner',
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
