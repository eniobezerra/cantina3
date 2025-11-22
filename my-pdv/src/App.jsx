/*
PDV React (Single-file App component)
Features implemented:
- Cadastro de produtos (CRUD) com preços
- Controle de comandas (incrementa número automático)
- Adicionar itens à comanda (carrinho) e finalizar venda
- Histórico de vendas guardado em localStorage
- Gera arquivos Excel (.xlsx) para:
  * Tabela de produtos
  * Movimento diário / histórico de vendas
- Total de vendas diário e quantidade de cada item vendido
- Impressão de comanda (área de impressão)

Dependências (instalar no projeto):
- npm install xlsx uuid instalado

Como usar:
1) Crie um projeto React (Vite ou CRA). Exemplo com Vite:
   npm create vite@latest my-pdv -- --template react
   cd my-pdv
2) Copie este arquivo para src/App.jsx substituindo o existente
3) Instale bibliotecas:
   npm install xlsx uuid
4) Rode:
   npm install
   npm run dev

Nota: este exemplo usa localStorage para persistência (sem banco). Para salvar em planilhas Excel o app usa SheetJS (xlsx) para gerar e baixar arquivos .xlsx.
*/

import React, { useEffect, useState, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import * as XLSX from 'xlsx';

const TODAY = () => new Date().toISOString().slice(0, 10); // YYYY-MM-DD

function useLocalStorageState(key, initial) {
  const [state, setState] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : initial;
    } catch (e) {
      return initial;
    }
  });
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(state)); } catch (e) {}
  }, [key, state]);
  return [state, setState];
}

export default function App() {
  // Produtos
  const [products, setProducts] = useLocalStorageState('pdv_products', [
    { id: uuidv4(), code: '001', name: 'Coxinha', price: 5.00 },
    { id: uuidv4(), code: '002', name: 'Suco', price: 3.50 },
  ]);
  const [productForm, setProductForm] = useState({ code: '', name: '', price: '' });
  const [editingId, setEditingId] = useState(null);

  // Comanda / carrinho
  const [cart, setCart] = useState([]);
  const [comandas, setComandas] = useLocalStorageState('pdv_comandas', []);
  const [lastComandaNumber, setLastComandaNumber] = useLocalStorageState('pdv_last_comanda', 1000);

  // Vendas
  const [sales, setSales] = useLocalStorageState('pdv_sales', []);

  // Filtros
  const [dateFilter, setDateFilter] = useState(TODAY());

  // Refs for receipt printing
  const receiptRef = useRef();

  // Produto CRUD handlers
  function handleProductChange(e) {
    const { name, value } = e.target;
    setProductForm(prev => ({ ...prev, [name]: value }));
  }

  function addOrUpdateProduct(e) {
    e.preventDefault();
    const price = parseFloat(productForm.price.toString().replace(',', '.')) || 0;
    if (editingId) {
      setProducts(prev => prev.map(p => p.id === editingId ? { ...p, code: productForm.code, name: productForm.name, price } : p));
      setEditingId(null);
    } else {
      setProducts(prev => [...prev, { id: uuidv4(), code: productForm.code || String(prev.length + 1).padStart(3, '0'), name: productForm.name, price }]);
    }
    setProductForm({ code: '', name: '', price: '' });
  }

  function editProduct(id) {
    const p = products.find(x => x.id === id);
    if (!p) return;
    setEditingId(id);
    setProductForm({ code: p.code, name: p.name, price: String(p.price) });
  }

  function deleteProduct(id) {
    if (!window.confirm('Apagar produto?')) return;
    setProducts(prev => prev.filter(p => p.id !== id));
  }

  // Carrinho
  function addToCart(productId, qty = 1) {
    const p = products.find(x => x.id === productId);
    if (!p) return;
    setCart(prev => {
      const exists = prev.find(i => i.productId === productId);
      if (exists) return prev.map(i => i.productId === productId ? { ...i, qty: i.qty + qty } : i);
      return [...prev, { productId, name: p.name, price: p.price, qty }];
    });
  }

  function changeQty(productId, qty) {
    setCart(prev => prev.map(i => i.productId === productId ? { ...i, qty: qty } : i).filter(i => i.qty > 0));
  }

  function removeFromCart(productId) {
    setCart(prev => prev.filter(i => i.productId !== productId));
  }

  // Comanda number
  function newComandaNumber() {
    const next = Number(lastComandaNumber) + 1;
    setLastComandaNumber(next);
    return next;
  }

  // Finalizar venda (gera comanda, salva histórico, limpa carrinho)
  function finalizeSale() {
    if (cart.length === 0) {
      alert('Carrinho vazio');
      return;
    }
    const comandaNumber = newComandaNumber();
    const total = cart.reduce((s, i) => s + i.price * i.qty, 0);
    const sale = {
      id: uuidv4(),
      comanda: comandaNumber,
      date: new Date().toISOString(),
      dateSimple: TODAY(),
      items: cart.map(i => ({ productId: i.productId, name: i.name, qty: i.qty, price: i.price })),
      total,
    };
    setSales(prev => [sale, ...prev]);
    setComandas(prev => [{ comanda: comandaNumber, date: sale.date, total }, ...prev]);
    setCart([]);

    // After sale, open a new window to print receipt or show printable area
    setTimeout(() => {
      // scroll to receipt and print
      if (receiptRef.current) {
        // Fill receipt area info by setting a temporary state
        const printContents = receiptRef.current.innerHTML;
        const newWin = window.open('', '_blank', 'width=600,height=800');
        if (newWin) {
          newWin.document.write('<html><head><title>Comanda ' + comandaNumber + '</title></head><body>');
          newWin.document.write(printContents);
          newWin.document.write('</body></html>');
          newWin.document.close();
          newWin.focus();
          newWin.print();
        }
      }
    }, 300);
  }

  // Exportar para Excel
  function exportProductsToExcel() {
    const ws = XLSX.utils.json_to_sheet(products.map(p => ({ Código: p.code, Nome: p.name, Preço: p.price })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Produtos');
    XLSX.writeFile(wb, `produtos_${TODAY()}.xlsx`);
  }

  function exportSalesToExcel(filterDate = null) {
    const data = (filterDate ? sales.filter(s => s.dateSimple === filterDate) : sales).map(s => ({
      Comanda: s.comanda,
      Data: s.date,
      Total: s.total,
      Itens: s.items.map(i => `${i.name} x${i.qty} (R$ ${i.price})`).join(' | '),
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Vendas');
    XLSX.writeFile(wb, `vendas_${filterDate || 'todas'}_${TODAY()}.xlsx`);
  }

  // Relatórios: total diário e quantidade por item
  function dailyTotals(date = TODAY()) {
    const filtered = sales.filter(s => s.dateSimple === date);
    const total = filtered.reduce((s, x) => s + x.total, 0);
    const itemsAgg = {};
    filtered.forEach(s => s.items.forEach(i => {
      if (!itemsAgg[i.name]) itemsAgg[i.name] = 0;
      itemsAgg[i.name] += i.qty;
    }));
    return { total, itemsAgg };
  }

  // Simple UI layout
  return (
    <div style={{ fontFamily: 'Arial, sans-serif', padding: 20 }}>
      <h1>PDV - React (Sem base de dados)</h1>
      <div style={{ display: 'flex', gap: 20 }}>
        {/* Produtos */}
        <div style={{ flex: 1, border: '1px solid #ddd', padding: 12, borderRadius: 8 }}>
          <h2>Cadastro de Produtos</h2>
          <form onSubmit={addOrUpdateProduct} style={{ display: 'flex', gap: 8, flexDirection: 'column' }}>
            <input name="code" placeholder="Código" value={productForm.code} onChange={handleProductChange} />
            <input name="name" placeholder="Nome" value={productForm.name} onChange={handleProductChange} />
            <input name="price" placeholder="Preço" value={productForm.price} onChange={handleProductChange} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit">{editingId ? 'Atualizar' : 'Adicionar'}</button>
              <button type="button" onClick={() => { setProductForm({ code: '', name: '', price: '' }); setEditingId(null); }}>Limpar</button>
              <button type="button" onClick={exportProductsToExcel}>Exportar produtos (Excel)</button>
            </div>
          </form>

          <table style={{ width: '100%', marginTop: 12, borderCollapse: 'collapse' }}>
            <thead><tr><th>Código</th><th>Nome</th><th>Preço</th><th>Ações</th></tr></thead>
            <tbody>
              {products.map(p => (
                <tr key={p.id} style={{ borderTop: '1px solid #eee' }}>
                  <td>{p.code}</td>
                  <td>{p.name}</td>
                  <td>R$ {Number(p.price).toFixed(2)}</td>
                  <td>
                    <button onClick={() => addToCart(p.id)}>+ Carrinho</button>
                    <button onClick={() => editProduct(p.id)}>Editar</button>
                    <button onClick={() => deleteProduct(p.id)}>Apagar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* PDV / Carrinho */}
        <div style={{ width: 420, border: '1px solid #ddd', padding: 12, borderRadius: 8 }}>
          <h2>Comanda (Carrinho)</h2>
          <div>Próxima comanda: <strong>{Number(lastComandaNumber) + 1}</strong></div>

          <div style={{ marginTop: 8 }}>
            {cart.length === 0 ? <div>Carrinho vazio</div> : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><th>Item</th><th>Qtd</th><th>Preço</th><th>Subtotal</th><th></th></tr></thead>
                <tbody>
                  {cart.map(i => (
                    <tr key={i.productId} style={{ borderTop: '1px solid #eee' }}>
                      <td>{i.name}</td>
                      <td><input type="number" value={i.qty} onChange={e => changeQty(i.productId, Number(e.target.value))} style={{ width: 60 }} /></td>
                      <td>R$ {Number(i.price).toFixed(2)}</td>
                      <td>R$ {(i.price * i.qty).toFixed(2)}</td>
                      <td><button onClick={() => removeFromCart(i.productId)}>Remover</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <div style={{ marginTop: 12 }}>
              <strong>Total: R$ {cart.reduce((s, i) => s + i.price * i.qty, 0).toFixed(2)}</strong>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button onClick={finalizeSale}>Finalizar (gerar comanda e imprimir)</button>
              <button onClick={() => setCart([])}>Limpar</button>
            </div>

            <div style={{ marginTop: 16 }}>
              <h4>Área de impressão (comanda gerada após finalizar)</h4>
              <div ref={receiptRef} style={{ padding: 8, border: '1px dashed #ccc' }}>
                <div>Loja Exemplo</div>
                <div>Comanda: <strong>{Number(lastComandaNumber)}</strong></div>
                <div>Data: {new Date().toLocaleString()}</div>
                <div>Itens:</div>
                <ul>
                  {cart.map(i => <li key={i.productId}>{i.name} x{i.qty} - R$ {i.price.toFixed(2)}</li>)}
                </ul>
                <div>Total: R$ {cart.reduce((s, i) => s + i.price * i.qty, 0).toFixed(2)}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Relatórios / Histórico */}
        <div style={{ flex: 1, border: '1px solid #ddd', padding: 12, borderRadius: 8 }}>
          <h2>Histórico de Vendas</h2>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label>Filtrar por data:</label>
            <input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)} />
            <button onClick={() => exportSalesToExcel(dateFilter)}>Exportar vendas (Excel)</button>
            <button onClick={() => exportSalesToExcel(null)}>Exportar todas vendas</button>
          </div>

          <div style={{ marginTop: 12 }}>
            <h4>Totals para {dateFilter}</h4>
            {(() => {
              const { total, itemsAgg } = dailyTotals(dateFilter);
              return (
                <div>
                  <div>Total do dia: R$ {total.toFixed(2)}</div>
                  <div>Quantidade por item:</div>
                  <ul>
                    {Object.keys(itemsAgg).length === 0 ? <li>Sem vendas</li> : Object.entries(itemsAgg).map(([name, qty]) => <li key={name}>{name}: {qty}</li>)}
                  </ul>
                </div>
              );
            })()}
          </div>

          <div style={{ marginTop: 12, maxHeight: 300, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th>Comanda</th><th>Data</th><th>Total</th></tr></thead>
              <tbody>
                {sales.map(s => (
                  <tr key={s.id} style={{ borderTop: '1px solid #eee' }}>
                    <td>{s.comanda}</td>
                    <td>{new Date(s.date).toLocaleString()}</td>
                    <td>R$ {s.total.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 16, fontSize: 12, color: '#666' }}>
        <div>Dados persistidos no localStorage do navegador. Para gerar arquivos Excel, o app baixa .xlsx usando SheetJS.</div>
        <div>Para implantar em produção, substitua localStorage por backend ou integração de arquivos em servidor.</div>
      </div>
    </div>
  );
}
