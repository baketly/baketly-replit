const m = "2023-10";
const d = new Date(parseInt(m.split('-')[0]), parseInt(m.split('-')[1])-1);
console.log(d.toLocaleString('en-US', { month: 'short' }));
