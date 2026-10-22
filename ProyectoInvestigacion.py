import streamlit as st
import pandas as pd
import pulp

# --- CONFIGURACIÓN DE LA PÁGINA ---
st.set_page_config(page_title="Optimización de Transporte", layout="wide")
st.title("🚛 Optimización de Logística: Modelo de Transporte")
st.write("Resolución del problema de distribución de equipos de red mediante Programación Lineal (IO).")

# --- DATOS POR DEFECTO (El Caso de Negocio) ---
origenes = ["Sololá", "Xela", "Capital"]
destinos = ["Panajachel", "San Lucas", "Santiago Atitlán"]

# --- SIDEBAR: INGRESO DE DATOS ---
st.sidebar.header("1. Configuración de Datos")

st.sidebar.subheader("Oferta (Equipos en Bodega)")
oferta_df = pd.DataFrame(
    {"Bodega": origenes, "Oferta": [150, 200, 100]}
).set_index("Bodega")
oferta_input = st.sidebar.data_editor(oferta_df, use_container_width=True)

st.sidebar.subheader("Demanda (Equipos Requeridos)")
demanda_df = pd.DataFrame(
    {"Destino": destinos, "Demanda": [120, 180, 150]}
).set_index("Destino")
demanda_input = st.sidebar.data_editor(demanda_df, use_container_width=True)

# --- MATRIZ DE COSTOS ---
st.subheader("2. Matriz de Costos de Envío (Quetzales por unidad)")
st.write("Edita los costos de envío desde cada bodega hacia cada municipio:")
costos_df = pd.DataFrame(
    {
        "Panajachel": [15, 45, 80],
        "San Lucas": [25, 40, 75],
        "Santiago Atitlán": [35, 50, 70]
    },
    index=origenes
)
costos_input = st.data_editor(costos_df, use_container_width=True)

# --- VALIDACIÓN DE EQUILIBRIO ---
total_oferta = oferta_input["Oferta"].sum()
total_demanda = demanda_input["Demanda"].sum()

st.write("---")
col1, col2 = st.columns(2)
col1.metric("Total Oferta Disponible", total_oferta)
col2.metric("Total Demanda Requerida", total_demanda)

if total_oferta != total_demanda:
    st.warning("⚠️ El modelo no está balanceado. Para que el método funcione correctamente, la Oferta debe ser igual a la Demanda. Ajusta los valores en el panel izquierdo.")
else:
    st.success("✅ Modelo balanceado. Listo para optimizar.")
    
    # --- BOTÓN DE OPTIMIZACIÓN ---
    if st.button("🚀 Optimizar Distribución", type="primary"):
        
        # --- EL CEREBRO: Lógica de PuLP (Investigación de Operaciones) ---
        # 1. Crear el problema (Buscamos MINIMIZAR costos)
        prob = pulp.LpProblem("Minimizacion_de_Costos", pulp.LpMinimize)
        
        # 2. Crear las variables de decisión (cuánto enviar de Origen a Destino)
        # Usamos diccionarios nativos de Python para evitar bugs de la librería
        vars_transporte = {}
        for o in origenes:
            vars_transporte[o] = {}
            for d in destinos:
                # Limpiamos los nombres quitando espacios (ej. "San Lucas" -> "San_Lucas")
                nombre_ruta = f"Ruta_{o.replace(' ', '_')}_a_{d.replace(' ', '_')}"
                # Solución al bloqueo de argumentos: instanciar y luego configurar propiedades
                var = pulp.LpVariable(nombre_ruta)
                var.lowBound = 0
                var.cat = 'Integer'
                vars_transporte[o][d] = var
                
        # 3. Función Objetivo (Costo * Cantidad Enviada)
        prob += pulp.lpSum([vars_transporte[o][d] * costos_input.loc[o, d] for o in origenes for d in destinos])
        
        # 4. Restricciones de Oferta (No enviar más de lo que hay en bodega)
        for o in origenes:
            prob += pulp.lpSum([vars_transporte[o][d] for d in destinos]) == oferta_input.loc[o, "Oferta"]
            
        # 5. Restricciones de Demanda (Cumplir exactamente con lo que pide el destino)
        for d in destinos:
            prob += pulp.lpSum([vars_transporte[o][d] for o in origenes]) == demanda_input.loc[d, "Demanda"]
            
        # 6. Resolver el problema
        prob.solve()
        
        # --- SALIDA DE RESULTADOS ---
        st.subheader("3. Resultados de la Optimización")
        
        if pulp.LpStatus[prob.status] == "Optimal":
            # Mostrar el costo mínimo
            costo_total = pulp.value(prob.objective)
            st.metric(label="Costo Mínimo Total Logrado", value=f"Q. {costo_total:,.2f}")
            
            # Construir la matriz de resultados
            resultados = []
            for o in origenes:
                fila = []
                for d in destinos:
                    cantidad = vars_transporte[o][d].varValue
                    fila.append(cantidad)
                resultados.append(fila)
                
            resultados_df = pd.DataFrame(resultados, index=origenes, columns=destinos)
            
            st.write("**Matriz de Envíos Óptima (Unidades a enviar):**")
            st.dataframe(resultados_df.style.highlight_max(axis=1, color="lightgreen"), use_container_width=True)
            
            st.info("💡 **Conclusión para la presentación:** La tabla verde muestra exactamente cuántos equipos deben salir de cada bodega hacia cada municipio para garantizar que se cubra toda la necesidad gastando lo menos posible.")
        else:
            st.error("No se encontró una solución óptima. Revisa los datos ingresados.")