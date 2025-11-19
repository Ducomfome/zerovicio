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
    // Inicializa o Firebase e o Token DENTRO da função para capturar erros de config
    const app = initFirebase();
    const db = getFirestore(app);
    const PUSHIN_TOKEN = process.env.PUSHIN_TOKEN;

    // Validações de Ambiente
    if (!PUSHIN_TOKEN) {
      console.error("PUSHIN_TOKEN ausente");
      return NextResponse.json({ error: 'Configuração de servidor incompleta (Token)' }, { status: 500 });
    }

    const body = await request.json();
    const { name, email, cpf, price, fbp, fbc, plan } = body;

    // Validação dos dados recebidos
    if (!name || !cpf || !price) {
       return NextResponse.json({ error: 'Dados incompletos (Nome, CPF ou Preço)' }, { status: 400 });
    }

    const valueInCents = Math.round(Number(price) * 100); 
    
    // Garante que a URL não tenha barra no final para não duplicar (ex: .app//api)
    const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || '').replace(/\/$/, '');
    const webhookUrl = `${baseUrl}/api/webhook`;

    const paymentPayload = {
      value: valueInCents,
      webhook_url: webhookUrl,
      payer: {
        name: name,
        document: cpf.replace(/\D/g, ''),
        email: email,
      }
    };

    console.log("🚀 Enviando para PushinPay:", JSON.stringify(paymentPayload));

    const pushinResponse = await fetch('https://api.pushinpay.com.br/api/pix/cashIn', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${PUSHIN_TOKEN}`
      },
      body: JSON.stringify(paymentPayload)
    });

    const data = await pushinResponse.json();

    if (!pushinResponse.ok) {
      console.error('❌ Erro Resposta PushinPay:', data);
      return NextResponse.json({ error: 'Erro na operadora de pagamento', details: data }, { status: 500 });
    }

    const transactionId = data.id;

    // Tenta salvar no Firestore
    try {
        await setDoc(doc(db, "transactions", transactionId), {
            status: 'created',
            plan: plan || 'unknown',
            email: email,
            name: name,
            price: price,
            fbp: fbp || null,
            fbc: fbc || null, 
            createdAt: new Date().toISOString()
        });
    } catch (firestoreError) {
        console.error("❌ Erro ao salvar no Firestore (Pix gerado, mas não salvo):", firestoreError);
        // Não vamos travar o usuário se o banco falhar, mas logamos o erro.
        // O ideal seria retornar erro, mas o usuário já tem o pix na mão.
    }

    return NextResponse.json({
      id: transactionId,
      qrCodeBase64: data.qr_code_base64,
      copiaECola: data.qr_code
    });

  } catch (error: any) {
    console.error('❌ ERRO CRÍTICO NO SERVIDOR:', error);
    return NextResponse.json({ 
        error: 'Erro interno no servidor', 
        message: error.message 
    }, { status: 500 });
  }
}
