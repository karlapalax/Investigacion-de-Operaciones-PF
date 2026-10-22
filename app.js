let db = {
    proveedores: JSON.parse(localStorage.getItem('zap_prov')) || [],
    productos: JSON.parse(localStorage.getItem('zap_prod')) || [],
    pedidos: JSON.parse(localStorage.getItem('zap_ped')) || [],
    ultimoResultado: JSON.parse(localStorage.getItem('zap_res')) || null
};

document.addEventListener('DOMContentLoaded', () => {
    actualizarPanel();
    renderTablas();
    if (db.ultimoResultado) renderResultados(db.ultimoResultado);
});

function guardarDB() {
    localStorage.setItem('zap_prov', JSON.stringify(db.proveedores));
    localStorage.setItem('zap_prod', JSON.stringify(db.productos));
    localStorage.setItem('zap_ped', JSON.stringify(db.pedidos));
    localStorage.setItem('zap_res', JSON.stringify(db.ultimoResultado));
    actualizarPanel();
    renderTablas();
}

function showModule(id) {
    document.querySelectorAll('.module').forEach(m => m.classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
    document.querySelectorAll('.nav-links a').forEach(a => a.classList.remove('active'));
    document.getElementById(`nav-${id}`).classList.add('active');
    document.getElementById('module-title').innerText = document.getElementById(`nav-${id}`).innerText;
}

function actualizarPanel() {
    document.getElementById('dash-prov').innerText = db.proveedores.length;
    document.getElementById('dash-prod').innerText = db.productos.length;
    document.getElementById('dash-ped').innerText = db.pedidos.length;
    if(db.proveedores.length === 0) document.getElementById('panel-empty').style.display = 'block';
    else document.getElementById('panel-empty').style.display = 'none';

    // Llenar selects
    let provSelect = document.getElementById('prod-prov');
    provSelect.innerHTML = '';
    db.proveedores.forEach(p => provSelect.innerHTML += `<option value="${p.id}">${p.nombre}</option>`);

    // Agrupar productos únicos por código para el select de pedidos
    let codigosUnicos = [...new Set(db.productos.map(p => p.codigo))];
    let pedSelect = document.getElementById('ped-codigo');
    pedSelect.innerHTML = '';
    codigosUnicos.forEach(cod => {
        let desc = db.productos.find(p => p.codigo === cod).desc;
        pedSelect.innerHTML += `<option value="${cod}">${cod} - ${desc}</option>`;
    });
}

function renderTablas() {
    // Prov
    let tbodyProv = document.querySelector('#tabla-proveedores tbody');
    tbodyProv.innerHTML = '';
    db.proveedores.forEach(p => tbodyProv.innerHTML += `<tr><td>${p.nombre}</td><td>${p.ubicacion}</td><td>Q${p.envio}</td><td><button class="btn-danger" onclick="eliminar('proveedores', ${p.id})">X</button></td></tr>`);
    
    // Prod
    let tbodyProd = document.querySelector('#tabla-productos tbody');
    tbodyProd.innerHTML = '';
    db.productos.forEach(p => {
        let provName = db.proveedores.find(pr => pr.id == p.provId)?.nombre || 'Desconocido';
        tbodyProd.innerHTML += `<tr><td>${p.codigo}</td><td>${p.desc}</td><td>${provName}</td><td>Q${p.precio}</td><td>${p.disp}</td><td><button class="btn-danger" onclick="eliminar('productos', ${p.id})">X</button></td></tr>`;
    });

    // Ped
    let tbodyPed = document.querySelector('#tabla-pedidos tbody');
    tbodyPed.innerHTML = '';
    db.pedidos.forEach(p => tbodyPed.innerHTML += `<tr><td>${p.codigo}</td><td>${p.cant}</td><td><button class="btn-danger" onclick="eliminar('pedidos', ${p.id})">X</button></td></tr>`);
}

function guardarProveedor(e) {
    e.preventDefault();
    db.proveedores.push({
        id: Date.now(),
        nombre: document.getElementById('prov-nombre').value,
        ubicacion: document.getElementById('prov-ubicacion').value,
        envio: parseFloat(document.getElementById('prov-envio').value)
    });
    e.target.reset(); guardarDB();
}

function guardarProducto(e) {
    e.preventDefault();
    db.productos.push({
        id: Date.now(),
        codigo: document.getElementById('prod-codigo').value,
        desc: document.getElementById('prod-desc').value,
        provId: parseInt(document.getElementById('prod-prov').value),
        precio: parseFloat(document.getElementById('prod-precio').value),
        disp: parseInt(document.getElementById('prod-disp').value)
    });
    e.target.reset(); guardarDB();
}

function guardarPedido(e) {
    e.preventDefault();
    db.pedidos.push({
        id: Date.now(),
        codigo: document.getElementById('ped-codigo').value,
        cant: parseInt(document.getElementById('ped-cant').value)
    });
    e.target.reset(); guardarDB();
}

function eliminar(tabla, id) {
    db[tabla] = db[tabla].filter(x => x.id !== id);
    guardarDB();
}

// --- CONEXIÓN CON GRAN M ---
function ejecutarGranM() {
    let out = document.getElementById('simplex-output');
    out.innerHTML = '';

    if (db.pedidos.length === 0) return out.innerHTML = `<div class="alert error">No hay necesidades registradas.</div>`;

    // Vamos a procesar un solo pedido para el ejemplo matemático claro (el primer pedido)
    // En un sistema robusto iteraríamos, pero para generar una matriz didáctica, un requerimiento es ideal.
    let pedido = db.pedidos[0]; 
    let prodsDisponibles = db.productos.filter(p => p.codigo === pedido.codigo);

    if(prodsDisponibles.length === 0) return out.innerHTML = `<div class="alert error">No hay proveedores registrados para el producto ${pedido.codigo}.</div>`;

    // 1. Construir Variables de Decisión
    let variables = [];
    prodsDisponibles.forEach((p, i) => {
        let prov = db.proveedores.find(pr => pr.id === p.provId);
        variables.push({ name: `X${i+1}`, cost: p.precio, prodId: p.id, provId: p.provId, provName: prov.nombre });
    });

    // 2. Construir Restricciones
    let constraints = [];
    // Restricción de Demanda (=)
    constraints.push({ coeffs: new Array(variables.length).fill(1), type: '=', rhs: pedido.cant });
    // Restricciones de Oferta (<=)
    variables.forEach((v, i) => {
        let coeffs = new Array(variables.length).fill(0);
        coeffs[i] = 1;
        let maxDisp = prodsDisponibles.find(p => p.id === v.prodId).disp;
        constraints.push({ coeffs: coeffs, type: '<=', rhs: maxDisp });
    });

    // 3. Ejecutar Clase Simplex
    let simplex = new SimplexBigM(variables, constraints);
    
    try {
        let result = simplex.solve();
        renderIteraciones(result.iterations, out);

        if (!result.feasible) {
            out.innerHTML += `<div class="alert error">Solución Inviable. Es posible que los proveedores no tengan suficiente inventario combinado para alcanzar la demanda exigida.</div>`;
            return;
        }

        // Post-procesamiento para Resultados
        procesarSolucionFinal(result, variables);

    } catch(err) {
        out.innerHTML = `<div class="alert error">Error Matemático: ${err.message}</div>`;
    }
}

function renderIteraciones(iters, container) {
    iters.forEach(it => {
        let html = `<div class="simplex-iteration"><h3>${it.title}</h3><table class="simplex-table"><thead><tr><th>Base</th><th>CB</th>`;
        it.headers.forEach(h => html += `<th>${h}</th>`);
        html += `</tr></thead><tbody>`;

        it.matrix.forEach((row, i) => {
            let isLeaving = i === it.leavingRow;
            let cb = (it.basisNames[i].startsWith('A')) ? 10000 : 0; // M visual
            if (it.Cj && it.basisNames[i].startsWith('X')) {
                let vIdx = parseInt(it.basisNames[i].replace('X','')) - 1;
                // Costo real visual
            }
            html += `<tr class="${isLeaving ? 'pivot-row' : ''}"><td><b>${it.basisNames[i]}</b></td><td>${it.Cj[simplex_getCBIndex(it, i)]}</td>`;
            row.forEach((val, j) => {
                let isEntering = j === it.enteringCol;
                let isPivot = isLeaving && isEntering;
                html += `<td class="${isEntering ? 'pivot-col' : ''} ${isPivot ? 'pivot-cell' : ''}">${val.toFixed(2)}</td>`;
            });
            html += `</tr>`;
        });

        html += `<tr><td colspan="2"><b>Zj - Cj</b></td>`;
        it.zRow.forEach((val, j) => {
            let isEntering = j === it.enteringCol;
            html += `<td class="${isEntering ? 'pivot-col' : ''}"><b>${val.toFixed(2)}</b></td>`;
        });
        html += `</tr></tbody></table></div>`;
        container.innerHTML += html;
    });
}

function simplex_getCBIndex(it, rowIndex) {
    // Helpers visual para la tabla
    let name = it.basisNames[rowIndex];
    return it.headers.indexOf(name);
}

function procesarSolucionFinal(result, variables) {
    let compras = [];
    let costoCompra = result.z;
    let provsUsados = new Set();

    variables.forEach(v => {
        let cantidad = result.solution[v.name] || 0;
        if (cantidad > 0) {
            compras.push({ producto: v.name, prov: v.provName, cant: cantidad, subtotal: cantidad * v.cost });
            provsUsados.add(v.provId);
        }
    });

    let costoEnvioTotal = 0;
    provsUsados.forEach(pid => {
        let p = db.proveedores.find(x => x.id === pid);
        costoEnvioTotal += p.envio;
    });

    db.ultimoResultado = {
        compras: compras,
        costoCompra: costoCompra,
        costoTotal: costoCompra + costoEnvioTotal
    };
    guardarDB();
    showModule('resultados');
    renderResultados(db.ultimoResultado);
}

function renderResultados(res) {
    document.getElementById('res-content').classList.remove('hidden');
    document.getElementById('res-costo-compra').innerText = `Q${res.costoCompra.toFixed(2)}`;
    document.getElementById('res-costo-total').innerText = `Q${res.costoTotal.toFixed(2)}`;

    let tbody = document.querySelector('#tabla-res-compras tbody');
    tbody.innerHTML = '';
    res.compras.forEach(c => {
        tbody.innerHTML += `<tr><td>${c.producto} (Algoritmo)</td><td>${c.prov}</td><td>${c.cant}</td><td>Q${c.subtotal.toFixed(2)}</td></tr>`;
    });
}

function exportarCSV() {
    if(!db.ultimoResultado) return;
    let csv = "Producto,Proveedor,Cantidad,Subtotal\n";
    db.ultimoResultado.compras.forEach(c => csv += `"${c.producto}","${c.prov}",${c.cant},${c.subtotal}\n`);
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = window.URL.createObjectURL(blob);
    a.download = 'resultados_granM.csv';
    a.click();
}

function limpiarDatos() {
    if(confirm("¿Eliminar todos los datos?")) { localStorage.clear(); location.reload(); }
}

function cargarDemo() {
    db.proveedores = [
        {id: 1, nombre: 'Capital Central', ubicacion: 'Guatemala', envio: 45},
        {id: 2, nombre: 'Distribuidora Xela', ubicacion: 'Xela', envio: 45}
    ];
    db.productos = [
        {id: 101, codigo: 'ZAP-01', desc: 'Nike Air Force T41', provId: 1, precio: 300, disp: 8},
        {id: 102, codigo: 'ZAP-01', desc: 'Nike Air Force T41', provId: 2, precio: 310, disp: 15}
    ];
    db.pedidos = [ {id: 201, codigo: 'ZAP-01', cant: 10} ];
    db.ultimoResultado = null;
    guardarDB();
    location.reload();
}