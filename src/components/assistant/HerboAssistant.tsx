'use client';

// ==============================================================================
// components/assistant/HerboAssistant.tsx — MSBot, conseiller Herbo (discret)
// ------------------------------------------------------------------------------
// Charge le widget M-SEC partagé (même MSBot que sur le site M-SEC), profil
// « herbo ». FAQ intégrée : MSBot répond même hors ligne ou si l'IA est
// indisponible. Bouton de commande : ouvre le panier (commande WhatsApp).
// Discret : lanceur en bas à droite, se réduit d'un geste, aucune donnée de
// suivi ; respecte « réduire les animations ».
// ==============================================================================

import { useEffect } from 'react';
import { SHOP_WHATSAPP } from '@/lib/whatsapp/order';

const WIDGET_SRC = 'https://oscarmulume.github.io/msec-technology-consulting/assistant/v2/msec-assistant.js';

type Answer = { fr: string; en: string };
interface AssistantElement extends HTMLElement {
  faq?: { keywords: string[]; answer: Answer }[];
  orderAction?: { label: Answer; href: () => string };
}

const FAQ = [
  {
    keywords: ['commander', 'commande', 'acheter', 'order'],
    answer: {
      fr: 'Facile : ajoute tes produits au panier, ouvre le panier, remplis ton nom, ton téléphone et ton adresse, puis appuie sur « Ouvrir WhatsApp ». Ta commande part dès que tu appuies sur Envoyer dans WhatsApp.',
      en: 'Easy: add products to the cart, open the cart, fill in your name, phone and address, then tap “Open WhatsApp”. Your order is sent once you tap Send in WhatsApp.',
    },
  },
  {
    keywords: ['payer', 'paiement', 'mpesa', 'm-pesa', 'airtel', 'orange', 'afrimoney', 'espèces', 'payment'],
    answer: {
      fr: 'Tu peux payer par M-Pesa, Airtel Money, Orange Money, Afrimoney ou en espèces à la livraison. On confirme le montant avec toi sur WhatsApp.',
      en: 'You can pay with M-Pesa, Airtel Money, Orange Money, Afrimoney or cash on delivery. We confirm the amount with you on WhatsApp.',
    },
  },
  {
    keywords: ['livraison', 'livrer', 'kinshasa', 'délai', 'delivery'],
    answer: {
      fr: 'On livre à domicile. Le prix et le délai de livraison dépendent de ton quartier : ils te sont confirmés sur WhatsApp avant de payer.',
      en: 'We deliver to your home. Delivery price and time depend on your area and are confirmed on WhatsApp before you pay.',
    },
  },
  {
    keywords: ['malade', 'maladie', 'traitement', 'médecin', 'enceinte', 'enfant', 'douleur'],
    answer: {
      fr: 'Je ne donne pas de conseil médical. Pour un problème de santé, une grossesse ou un enfant, demande d’abord l’avis d’un médecin ou d’un pharmacien.',
      en: 'I do not give medical advice. For a health problem, pregnancy or a child, first ask a doctor or pharmacist.',
    },
  },
];

export function HerboAssistant() {
  useEffect(() => {
    // Propriétés posées APRÈS la définition du composant : posées avant, elles masqueraient ses accesseurs.
    customElements.whenDefined('msec-assistant').then(() => {
      const el = document.querySelector('msec-assistant') as AssistantElement | null;
      if (!el) return;
      el.faq = FAQ;
      el.orderAction = {
        label: { fr: 'Commander sur WhatsApp', en: 'Order on WhatsApp' },
        href: () => '/herbo/checkout/',
      };
    });
    if (!document.querySelector(`script[src="${WIDGET_SRC}"]`)) {
      const script = document.createElement('script');
      script.src = WIDGET_SRC;
      script.defer = true;
      document.body.appendChild(script);
    }
  }, []);

  return (
    // @ts-expect-error — élément personnalisé (Web Component M-SEC)
    <msec-assistant app="herbo" lang="fr" accent="#1f7a4d" data-whatsapp={SHOP_WHATSAPP} />
  );
}
