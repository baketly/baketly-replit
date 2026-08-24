const sales = [
  {
    id: "1", occurredAt: "2023-10-01T10:00:00Z", source: "pos",
    lineItems: [{ productId: "p1", name: "Babka", quantity: 2, unitPrice: 10, unitCost: 4 }]
  }
];
const monthsList = Array.from(new Set(sales.map(s => {
  const d = new Date(s.occurredAt);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
})));
console.log(monthsList);
