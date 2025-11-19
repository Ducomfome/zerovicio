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
    
    // 1. CREDENCIAIS PARADISE PAGS
    const RECIPIENT_ID = (process.env.PARADISE_RECIPIENT_ID || '').trim(); 
    const SECRET_KEY = (process.env.PARADISE_SECRET_KEY || '').trim();    

    console.log(`🔑 Tentando Auth com: ${RECIPIENT_ID} | ${SECRET_KEY.slice(0, 5)}...`);

    if (!RECIPIENT_ID || !SECRET_KEY) {
      return NextResponse.json({ error: 'Credenciais ausentes na Vercel' }, { status: 500 });
    }

    const body = await request.json();
    const { name, email, cpf, price, plan, fbp, fbc } = body;

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

    console.log("🚀 Enviando Payload...", JSON.stringify(paymentPayload));

    // 2. URL CORRETA PARA PARADISE PAGS
    // Usamos a URL direta deles pois seu ID é "store_..."
    const API_URL = "https://api.paradisepags.com/v1/gateway/request-qrcode";
    
    const gatewayResponse = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': SECRET_KEY, // Conforme seu print (Chave Secreta)
        'ci': RECIPIENT_ID       // ID da Conta (Store ID)
      },
      body: JSON.stringify(paymentPayload)
    });

    const responseText = await gatewayResponse.text();
    console.log("📩 Resposta Gateway:", responseText);

    let data;
    try {
        data = JSON.parse(responseText);
    } catch (e) {
        return NextResponse.json({ error: 'Erro 502: Gateway não retornou JSON', rawResponse: responseText }, { status: 502 });
    }

    // Se der erro de acesso, retornamos o detalhe para o front ver
    if (gatewayResponse.status === 403 || gatewayResponse.status === 401) {
        return NextResponse.json({ error: 'Erro de Acesso (403/401)', details: data, message: "Verifique se as chaves na Vercel não tem espaços extras" }, { status: 403 });
    }

    if (!gatewayResponse.ok || data.response === 'Error') {
      return NextResponse.json({ error: 'Erro no processamento', details: data }, { status: 500 });
    }

    const pixCopiaCola = data.paymentCode || data.pix_code || data.qrcode_text;
    const qrCodeImage = data.paymentCodeBase64 || data.qrcode_image;
    const finalId = data.idTransaction || transactionId;

    await setDoc(doc(db, "transactions", String(finalId)), {
        status: 'created',
        provider: 'paradise',
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
