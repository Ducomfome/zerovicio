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
  try {
    const app = initFirebase();
    if (!app) return NextResponse.json({ error: 'Erro Config Firebase' }, { status: 500 });
    const db = getFirestore(app);
    
    const SECRET_KEY = (process.env.PARADISE_SECRET_KEY || '').trim();    

    if (!SECRET_KEY) return NextResponse.json({ error: 'Chave Secreta ausente' }, { status: 500 });

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

    console.log("🚀 Enviando para SuitPay (Modo X-API-Key Puro)...");

    // ESTRATÉGIA: Obedecer estritamente o painel da Paradise.
    // URL: Motor SuitPay
    // Headers: APENAS Content-Type e X-API-Key. Sem 'ci' ou 'cs'.
    const API_URL = "https://ws.suitpay.app/api/v1/gateway/request-qrcode";
    
    const gatewayResponse = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': SECRET_KEY
      },
      body: JSON.stringify(paymentPayload)
    });

    const responseText = await gatewayResponse.text();
    console.log(`📩 Status: ${gatewayResponse.status}`);
    console.log(`📩 Resposta: ${responseText}`);

    let data;
    try { data = JSON.parse(responseText); } catch(e) {}

    if (gatewayResponse.status === 403 || gatewayResponse.status === 401) {
        return NextResponse.json({ 
            error: 'Acesso Negado (403).', 
            message: "A chave X-API-Key foi rejeitada. Confirme se copiou a 'Chave Secreta' inteira.",
            details: data 
        }, { status: 403 });
    }

    if (!gatewayResponse.ok || data.response === 'Error') {
      return NextResponse.json({ error: 'Erro no processamento', details: data }, { status: 500 });
    }

    const pixCopiaCola = data.paymentCode || data.pix_code || data.qrcode_text;
    const qrCodeImage = data.paymentCodeBase64 || data.qrcode_image;
    const finalId = data.idTransaction || transactionId;

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

  } catch (error: any) {
    console.error('❌ ERRO CRÍTICO:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
