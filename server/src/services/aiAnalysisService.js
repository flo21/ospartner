export function buildPartnerAnalysis({ partner, contract, products, prices, orders, invoices }) {
  const openAlerts = prices.filter((price) => price.status === 'anomalie' || price.status === 'anomaly').length;
  const consumedOrders = orders.filter((order) => order.status === 'consommé').length;
  const pendingInvoices = invoices.filter((invoice) => invoice.status === 'soumis').length;

  return {
    summary: `${partner.name} présente un score santé de ${partner.health_score}/100 avec ${consumedOrders} commandes consommées et ${openAlerts} anomalie(s) prix récentes.`,
    anomalies: [
      ...(openAlerts ? [`${openAlerts} contrôle(s) prix en anomalie à traiter.`] : []),
      ...(pendingInvoices ? [`${pendingInvoices} facture(s) en attente de validation.`] : []),
      ...(contract?.status !== 'actif' ? ['Aucun contrat actif prioritaire identifié.'] : [])
    ],
    recommendations: [
      'Revoir les URLs concurrentes une fois par semaine pendant la phase MVP.',
      'Prioriser les partenaires avec forte marge et volume régulier.',
      'Documenter les règles de report et annulation dans chaque contrat actif.'
    ],
    renegotiation_opportunities: products
      .filter((product) => Number(product.margin_rate) < 20)
      .map((product) => `Renégocier ${product.name}: marge actuelle ${product.margin_rate}%.`)
  };
}
