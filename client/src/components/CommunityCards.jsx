import Card from './Card.jsx';

export default function CommunityCards({ cards = [] }) {
  const slots = [...cards, ...Array(5 - cards.length).fill(null)];
  return (
    <div style={{ display: 'flex', gap: 8, justifyContent: 'center', margin: '16px 0' }}>
      {slots.map((card, i) => <Card key={i} card={card} faceDown={!card} />)}
    </div>
  );
}
