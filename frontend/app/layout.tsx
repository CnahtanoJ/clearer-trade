import type { Metadata } from "next";
import { Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import dynamic from "next/dynamic";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/react";
import "./globals.css";

const InteractiveBackground = dynamic(
  () => import("@/components/InteractiveBackground"),
  { ssr: false }
);

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "clearer.trade",
  description: "Stateless trade analytics, tilt simulation, and behavioral AI audits.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`dark ${plusJakarta.variable} ${jetbrainsMono.variable}`}>
      <head>
        <Script
          id="whop-tracker"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `!function(w,d,s,u,n,a,b){if(w[n])return;a=w[n]={q:[],t:+new Date,s:[],o:u,track:function(){a.q.push([+new Date].concat([].slice.call(arguments)))},setScope:function(){a.s=[].slice.call(arguments).filter(function(x){return typeof x==="string"});a.q.push([+new Date,"setScope"].concat(a.s))},scope:function(){var c=[].slice.call(arguments);return{track:function(){a.q.push([+new Date].concat([].slice.call(arguments)).concat([{__scope:c}]))}}}};b=d.createElement(s);b.async=1;b.src=u+"/s.js";d.getElementsByTagName(s)[0].parentNode.insertBefore(b,d.getElementsByTagName(s)[0])}(window,document,"script","https://t.whop.tw","whop");whop.setScope("biz_rnYm7cFW5jhc4F");whop.track("page");`,
          }}
        />
      </head>
      <body className="antialiased text-slate-200 font-sans bg-[#070a0f] min-h-screen relative">
        <InteractiveBackground />
        {children}
        <Analytics />
      </body>
    </html>
  );
}

