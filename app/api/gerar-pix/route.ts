import { NextResponse } from 'next/server';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';

// --- INICIALIZAÇÃO SEGURA DO FIREBASE ---
const initFirebase = () => {
  const configStr = process.env.NEXT_PUBLIC_FIREBASE_CONFIG;
  if (!configStr) throw new Error('❌ Váriavel NEXT_PUBLIC_FIREBASE_CONFIG não encontrada!');
  try {
    const firebaseConfig = JSON.parse(configStr);
    return !getApps().length ? initializeApp(firebaseConfig) : getApp();
  } catch (e) {
    console.error("Erro JSON Firebase:", e);
    throw new Error('❌ Erro JSON Firebase');
  }
};

export async function POST(request: Request) {
  let logErros = []; // Vamos guardar os erros pra te mostrar se tudo falhar
  
  try {
    const app = initFirebase();
    const db = getFirestore(app);
    
    const RECIPIENT_ID = (process.env.PARADISE_RECIPIENT_ID || '').trim(); 
    const SECRET_KEY = (process.env.PARADISE_SECRET_KEY || '').trim();    

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

    console.log("🚀 Iniciando Tentativas de Conexão...");

    // --- LISTA DE ESTRATÉGIAS ---
    const strategies = [
        {
            name: "1. Paradise Oficial (X-API-Key)",
            url: "https://api.paradisepags.com/v1/gateway/request-qrcode",
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': SECRET_KEY
            }
        },
        {
            name: "2. SuitPay Padrão (ci/cs)",
            url: "https://ws.suitpay.app/api/v1/gateway/request-qrcode",
            headers: {
                'Content-Type': 'application/json',
                'ci': RECIPIENT_ID, 
                'cs': SECRET_KEY
            }
        },
        {
            name: "3. SuitPay (ID Limpo)",
            url: "https://ws.suitpay.app/api/v1/gateway/request-qrcode",
            headers: {
                'Content-Type': 'application/json',
                // Remove 'store_' se existir, para tentar o ID puro
                'ci': RECIPIENT_ID.replace('store_', ''), 
                'cs': SECRET_KEY
            }
        }
    ];

    let successData = null;

    // --- LOOP DE TENTATIVAS ---
    for (const strategy of strategies) {
        console.log(`🔄 Tentando: ${strategy.name}...`);
        try {
            const response = await fetch(strategy.url, {
                method: 'POST',
                headers: strategy.headers,
                body: JSON.stringify(paymentPayload)
            });
            
            const text = await response.text();
            console.log(`   Status: ${response.status}`);
            
            // Se deu certo (200 ou 201), paramos de tentar
            if (response.ok) {
                try {
                    const json = JSON.parse(text);
                    if (json.response !== 'Error') {
                        console.log(`✅ SUCESSO com: ${strategy.name}`);
                        successData = json;
                        break; // Sai do loop
                    }
                } catch(e) {}
            } else {
                logErros.push(`${strategy.name}: Status ${response.status} - ${text.slice(0, 100)}`);
            }
        } catch (err: any) {
            console.error(`   Erro conexão: ${err.message}`);
            logErros.push(`${strategy.name}: Erro de Rede - ${err.message}`);
        }
    }

    // --- RESULTADO ---
    if (!successData) {
        // Se chegou aqui, TODAS falharam
        console.error("❌ Todas as tentativas falharam.");
        return NextResponse.json({ 
            error: 'Falha na comunicação com Paradise/SuitPay', 
            logs: logErros,
            message: "Verifique os logs na Vercel para ver qual método chegou mais perto."
        }, { status: 502 });
    }

    // Se deu certo, segue o fluxo normal
    const data = successData;
    const pixCopiaCola = data.paymentCode || data.pix_code || data.qrcode_text;
    const qrCodeImage = data.paymentCodeBase64 || data.qrcode_image;
    const finalId = data.idTransaction || transactionId;

    await setDoc(doc(db, "transactions", String(finalId)), {
        status: 'created',
        provider: 'paradise_auto',
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
