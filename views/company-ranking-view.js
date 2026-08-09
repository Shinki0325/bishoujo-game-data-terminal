import { tierColor } from '../lib/tier-palette.js';

function requireElement(root, id) {
  const element = root.querySelector?.(`#${id}`);
  if (!element) throw new Error(`Company ranking root is missing #${id}`);
  return element;
}

function companyCard(documentRef, company, imageUrlForCompany, onOpenCompany) {
  const card = documentRef.createElement('button');
  card.type = 'button';
  card.className = 'company-ranking-card';
  card.draggable = true;
  card.dataset.companyId = company.companyId;
  card.setAttribute('aria-label', company.brandName);
  const image = documentRef.createElement('img');
  image.alt = '';
  image.loading = 'lazy';
  image.decoding = 'async';
  image.src = imageUrlForCompany(company) ?? '';
  image.addEventListener('error', () => card.classList.add('is-image-missing'), { once: true });
  const title = documentRef.createElement('span');
  title.className = 'company-ranking-card-title';
  title.textContent = company.brandName;
  card.append(image, title);
  card.addEventListener('click', () => onOpenCompany(company.companyId));
  return card;
}

export function createCompanyRankingView({ root, onMoveToTier, onMoveToCandidates, onOpenCompany }) {
  if (!root || typeof root.querySelector !== 'function') throw new TypeError('root must provide querySelector');
  for (const callback of [onMoveToTier, onMoveToCandidates, onOpenCompany]) {
    if (typeof callback !== 'function') throw new TypeError('company ranking callbacks must be functions');
  }
  const documentRef = root.ownerDocument;
  const board = requireElement(root, 'company-ranking-board');
  const candidates = requireElement(root, 'company-ranking-candidates');
  let draggedCompanyId = null;

  function draggableCard(company, imageUrlForCompany) {
    const card = companyCard(documentRef, company, imageUrlForCompany, onOpenCompany);
    card.addEventListener('dragstart', event => {
      draggedCompanyId = company.companyId;
      event.dataTransfer?.setData?.('text/plain', company.companyId);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
    });
    card.addEventListener('dragend', () => { draggedCompanyId = null; });
    return card;
  }

  function dropTarget(target, move) {
    target.addEventListener('dragover', event => event.preventDefault());
    target.addEventListener('drop', event => {
      event.preventDefault();
      const companyId = draggedCompanyId ?? event.dataTransfer?.getData?.('text/plain');
      if (typeof companyId === 'string' && companyId.length > 0) move(companyId);
      draggedCompanyId = null;
    });
  }

  return Object.freeze({
    render({ companies, tiers, ranking, imageUrlForCompany }) {
      const byId = new Map(companies.map(company => [company.companyId, company]));
      board.replaceChildren();
      for (const tier of tiers) {
        const row = documentRef.createElement('section');
        row.className = 'company-ranking-tier';
        const label = documentRef.createElement('h3');
        label.textContent = tier.name;
        label.style.background = tierColor(tier.colorId);
        const track = documentRef.createElement('div');
        track.className = 'company-ranking-track';
        track.dataset.tierId = tier.id;
        const cards = (ranking.tierOrder[tier.id] ?? []).flatMap(companyId => {
          const company = byId.get(companyId);
          return company ? [draggableCard(company, imageUrlForCompany)] : [];
        });
        track.append(...cards);
        dropTarget(track, companyId => onMoveToTier(companyId, tier.id));
        row.append(label, track);
        board.append(row);
      }
      candidates.replaceChildren(...ranking.candidateCompanyIds.flatMap(companyId => {
        const company = byId.get(companyId);
        return company ? [draggableCard(company, imageUrlForCompany)] : [];
      }));
      dropTarget(candidates, companyId => onMoveToCandidates(companyId));
    }
  });
}
