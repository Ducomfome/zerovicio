// Arquivo: app/layout.tsx
// (CÓDIGO FULL ATUALIZADO COM SCROLL SUAVE)

import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Zero Vicios", // <- Já atualizei o título para você
  description: "Descrição do seu produto para o Google",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // A MÁGICA ACONTECE AQUI:
    // Adicionamos a classe "scroll-smooth" na tag <html>
    // Isso faz todos os links <a> com # (como o seu) rolarem suavemente.
    <html lang="pt-BR" className="scroll-smooth"> 
      <body className={poppins.className}>{children}</body>
    </html>
  );
}