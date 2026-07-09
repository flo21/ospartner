import { env } from '../config/env.js';

export function normalizeAfiflyUrl(url) {
  if (url == null || String(url).trim() === '') return null;
  const trimmed = String(url).trim().toLowerCase().replace(/\/+$/, '');
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const parsed = new URL(withProtocol);
  const subdomain = extractAfiflySubdomain(parsed.href);
  if (!subdomain) return null;
  return `https://${subdomain}.afifly.fr`;
}

export function extractAfiflySubdomain(url) {
  if (url == null || String(url).trim() === '') return null;
  try {
    const trimmed = String(url).trim().toLowerCase();
    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const parsed = new URL(withProtocol);
    const host = parsed.hostname;
    if (!host.endsWith('.afifly.fr')) return null;
    const subdomain = host.replace(/\.afifly\.fr$/, '');
    return /^[a-z0-9-]+$/.test(subdomain) ? subdomain : null;
  } catch {
    return null;
  }
}

function afiflyError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

async function requestAfifly(partner, path) {
  if (!partner.afifly_subdomain) {
    throw afiflyError('Lien Afifly non renseigné pour ce partenaire.', 400);
  }
  if (!env.afiflyTestApiToken) {
    throw afiflyError('Token Afifly non configuré côté serveur.', 500);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  const url = `https://${partner.afifly_subdomain}.afifly.fr${path}`;
  console.log(`[Afifly] GET ${url}`);
  try {
    const response = await fetch(url, {
      headers: { 'x-api-token': env.afiflyTestApiToken },
      signal: controller.signal
    });

    if (!response.ok) {
      if (response.status === 403) throw afiflyError('Token Afifly refusé.', 403);
      if (response.status === 404) throw afiflyError('Ressource Afifly introuvable.', 404);
      if (response.status === 402) throw afiflyError('Accès Afifly refusé: paiement requis.', 402);
      throw afiflyError(`Erreur Afifly ${response.status}.`, response.status);
    }

    const contentType = response.headers.get('content-type') || '';
    const data = contentType.includes('application/json') ? await response.json() : await response.text();
    if (path.startsWith('/shopapi/planning/places')) {
      console.log('[Afifly availability raw]', JSON.stringify(data).slice(0, 3000));
    }
    return data;
  } catch (error) {
    if (error.name === 'AbortError' || error.cause?.code) {
      throw afiflyError('Impossible de contacter Afifly.', 504);
    }
    if (error.status) throw error;
    throw afiflyError('Impossible de contacter Afifly.', 502);
  } finally {
    clearTimeout(timeout);
  }
}

export function getAfiflyPlannings(partner) {
  return requestAfifly(partner, '/shopapi/plannings');
}

export function getAfiflyAvailability(partner, { from, to, planningId }) {
  const params = new URLSearchParams({ from, to, planning_id: planningId });
  return requestAfifly(partner, `/shopapi/planning/places?${params.toString()}`);
}
