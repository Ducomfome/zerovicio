import { NextResponse } from 'next/server';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';

const initFirebase = () => {
  const configStr = process.env.NEXT_PUBLIC_FIREBASE_CONFIG;
  if (!configStr) { console.error('❌ Firebase Config Missing'); return null; }
  try {
    const firebaseConfig = JSON.parse(configStr);
    return !getApps().length ? initializeApp(firebaseConfig) : getApp();
  } catch (e) { return null; }
};

export async function POST(request: Request) {
  let logErros: string[] = []; 
  
  try {
    const app = initFirebase();
    if (!app) return NextResponse.json({ error: 'Erro Config Firebase' }, { status: 500 });
    const db = getFirestore(app);
    
    const RECIPIENT_ID = (process.env.PARADISE_RECIPIENT_ID || '').trim(); 
    const SECRET_KEY = (process.env.PARADISE_SECRET_KEY || '').trim();    

    if (!RECIPIENT_ID || !SECRET_KEY) return NextResponse.json({ error: 'Credenciais ausentes' }, { status: 500 });

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

    console.log("🚀 Iniciando Teste de Força Bruta na SuitPay...");

    // ESTRATÉGIA ÚNICA: URL CERTA + TODOS OS HEADERS
    // Sabemos que ws.suitpay.app existe (deu 403, não 404).
    // Vamos mandar a chave em todos os lugares possíveis.
    const strategy = {
        url: "https://ws.suitpay.app/api/v1/gateway/request-qrcode",
        headers: {
            'Content-Type': 'application/json',
            'ci': RECIPIENT_ID,       // Tenta como CI
            'cs': SECRET_KEY,         // Tenta como CS
            'X-API-Key': SECRET_KEY,  // Tenta como Header da Paradise
            'store-id': RECIPIENT_ID  // Tenta como Store ID
        }
    };

    console.log(`🔄 Tentando conectar em: ${strategy.url}`);
    
    const response = await fetch(strategy.url, {
        method: 'POST',
        headers: strategy.headers,
        body: JSON.stringify(paymentPayload)
    });
    
    const text = await response.text();
    console.log(`   STATUS: ${response.status}`);
    console.log(`   RESPOSTA DO SERVIDOR: ${text}`); // ISSO É O OURO! Vai dizer o motivo do erro.

    let data;
    try { data = JSON.parse(text); } catch(e) {}

    if (response.ok && data?.response !== 'Error') {
        // SUCESSO!
        const pixCopiaCola = (data as any).paymentCode || (data as any).pix_code || (data as any).qrcode_text;
        const qrCodeImage = (data as any).paymentCodeBase64 || (data as any).qrcode_image;
        const finalId = (data as any).idTransaction || transactionId;

        await setDoc(doc(db, "transactions", String(finalId)), {
            status: 'created',
            provider: 'paradise_suitpay',
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
    } else {
        // FALHA
        console.error("❌ Falha na conexão.");
        return NextResponse.json({ 
            error: `Erro ${response.status} na SuitPay`, 
            serverMessage: text, // Mostra para você o que o servidor disse
            message: "Verifique o log 'RESPOSTA DO SERVIDOR' na Vercel para saber o motivo exato."
        }, { status: 502 });
    }

  } catch (error: any) {
    console.error('❌ ERRO CRÍTICO:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
