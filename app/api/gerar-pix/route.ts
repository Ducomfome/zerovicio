import { NextResponse } from 'next/server';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';

// --- INICIALIZAÇÃO SEGURA DO FIREBASE ---
const initFirebase = () => {
  const configStr = process.env.NEXT_PUBLIC_FIREBASE_CONFIG;
  
  if (!configStr) {
    throw new Error('❌ Váriavel NEXT_PUBLIC_FIREBASE_CONFIG não encontrada!');
  }

  try {
    const firebaseConfig = JSON.parse(configStr);
    return !getApps().length ? initializeApp(firebaseConfig) : getApp();
  } catch (e) {
    console.error("Erro ao fazer parse do JSON do Firebase:", e);
    throw new Error('❌ Erro na formatação do JSON do Firebase');
  }
};

export async function POST(request: Request) {
  try {
    const app = initFirebase();
    const db = getFirestore(app);
    
    // 1. CREDENCIAIS PARADISE PAGS (SUITPAY)
    const RECIPIENT_ID = process.env.PARADISE_RECIPIENT_ID; 
    const SECRET_KEY = process.env.PARADISE_SECRET_KEY;    

    if (!RECIPIENT_ID || !SECRET_KEY) {
      return NextResponse.json({ error: 'Credenciais de API não configuradas' }, { status: 500 });
    }

    const body = await request.json();
    const { name, email, cpf, price, fbp, fbc, plan } = body;

    if (!name || !cpf || !price) {
       return NextResponse.json({ error: 'Dados incompletos' }, { status: 400 });
    }

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

    console.log("🚀 Enviando para Gateway...", JSON.stringify(paymentPayload));

    // 2. URL CORRIGIDA (SUITPAY / PARADISE)
    // A Paradise usa a infraestrutura da SuitPay. Essa é a URL padrão que funciona para ambas.
    const API_URL = "https://ws.suitpay.app/api/v1/gateway/request-qrcode";

    const gatewayResponse = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'ci': RECIPIENT_ID, 
        'cs': SECRET_KEY   
      },
      body: JSON.stringify(paymentPayload)
    });

    // 3. DEBUG INTELIGENTE (Para não quebrar com erro <DOCTYP...)
    const responseText = await gatewayResponse.text();
    console.log("📩 Resposta Bruta do Gateway:", responseText);

    let data;
    try {
        data = JSON.parse(responseText);
    } catch (e) {
        console.error("❌ A API retornou HTML ou Texto inválido, verifique a URL ou Credenciais.");
        return NextResponse.json({ error: 'Erro de comunicação com o Gateway', rawResponse: responseText }, { status: 502 });
    }

    if (!gatewayResponse.ok || data.response === 'Error') {
      return NextResponse.json({ error: 'Erro no processamento do Gateway', details: data }, { status: 500 });
    }

    // 4. TRATAMENTO DA RESPOSTA
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
