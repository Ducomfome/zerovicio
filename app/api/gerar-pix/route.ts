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
    
    // 1. CREDENCIAIS
    const RECIPIENT_ID = (process.env.PARADISE_RECIPIENT_ID || '').trim(); 
    const SECRET_KEY = (process.env.PARADISE_SECRET_KEY || '').trim();    

    // Debug simples para ver se as chaves estão lá
    console.log(`🔑 Auth: StoreID=${RECIPIENT_ID.slice(0,6)}... | Secret=${SECRET_KEY.slice(0,3)}...`);

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

    console.log("🚀 Payload:", JSON.stringify(paymentPayload));

    // 2. URL DA SUITPAY (INFRAESTRUTURA DA PARADISE)
    // Voltamos para esta URL pois ela responde JSON corretamente
    const API_URL = "https://ws.suitpay.app/api/v1/gateway/request-qrcode";
    
    const gatewayResponse = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': SECRET_KEY, // Header ESPECÍFICO que seu painel pediu
        'ci': RECIPIENT_ID,      // Seu Store ID
        'cs': SECRET_KEY         // Enviamos também no 'cs' por garantia (alguns endpoints aceitam ambos)
      },
      body: JSON.stringify(paymentPayload)
    });

    const responseText = await gatewayResponse.text();
    console.log("📩 Resposta Gateway:", responseText);

    let data;
    try {
        data = JSON.parse(responseText);
    } catch (e) {
        return NextResponse.json({ error: 'Erro 502: Gateway retornou HTML', rawResponse: responseText }, { status: 502 });
    }

    if (gatewayResponse.status === 403 || gatewayResponse.status === 401) {
        return NextResponse.json({ error: 'Acesso Negado (403).', details: data, message: "Verifique se o ID da Loja e a Chave estão corretos na Vercel." }, { status: 403 });
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
