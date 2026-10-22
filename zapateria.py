import streamlit as st
import pandas as pd
import pulp

# Configuración de la página
st.set_page_config(page_title="Logística de Zapatería", page_icon="👟", layout="wide")
st.title("👟 Sistema de Optimización de Envíos")
st.write(
    "Calcula cómo distribuir los paquetes desde las bodegas hacia los departamentos "
    "al menor costo posible."
)

# Datos de ejemplo
oferta_data = {
    "Bodega": ["Bodega Central (Capital)", "Bodega Occidente (Xela)"],
    "Disponibles": [500, 300],
}
df_oferta = pd.DataFrame(oferta_data)

demanda_data = {
    "Departamento": ["Petén", "Sololá", "Zacapa"],
    "Requeridos": [200, 150, 400],
}
df_demanda = pd.DataFrame(demanda_data)

# Costos por paquete: filas = bodegas, columnas = departamentos
df_costos = pd.DataFrame(
    {
        "Petén": [45, 60],
        "Sololá": [35, 20],
        "Zacapa": [25, 50],
    },
    index=["Bodega Central (Capital)", "Bodega Occidente (Xela)"],
)
df_costos.index.name = "Bodega"

# Mostrar los datos
col1, col2 = st.columns(2)

with col1:
    st.subheader("📦 Inventario en bodegas (oferta)")
    st.dataframe(df_oferta, use_container_width=True, hide_index=True)

with col2:
    st.subheader("🛒 Pedidos por departamento (demanda)")
    st.dataframe(df_demanda, use_container_width=True, hide_index=True)

st.subheader("💰 Tarifas de envío por paquete (Q)")
st.dataframe(df_costos, use_container_width=True)

total_oferta = int(df_oferta["Disponibles"].sum())
total_demanda = int(df_demanda["Requeridos"].sum())

col3, col4 = st.columns(2)
col3.metric("Paquetes disponibles", f"{total_oferta:,}")
col4.metric("Paquetes solicitados", f"{total_demanda:,}")

if total_oferta < total_demanda:
    st.warning(
        "La oferta total es menor que la demanda. No se podrán completar todos los pedidos "
        "con los datos actuales."
    )

if st.button("🚀 Ejecutar optimización", type="primary"):
    try:
        bodegas = df_oferta["Bodega"].tolist()
        destinos = df_demanda["Departamento"].tolist()

        oferta = dict(zip(bodegas, df_oferta["Disponibles"].astype(int)))
        demanda = dict(zip(destinos, df_demanda["Requeridos"].astype(int)))
        costos = df_costos.to_dict(orient="index")

        # Modelo de minimización
        prob = pulp.LpProblem("Optimizacion_Envios_Zapateria", pulp.LpMinimize)

        # Se pasan los límites como argumentos posicionales para evitar el error
        # de compatibilidad con instalaciones que no aceptan lowBound como palabra clave.
        rutas = {
            b: {
                d: pulp.LpVariable(
                    f"Ruta_{i}_{j}", 0, None, pulp.LpInteger
                )
                for j, d in enumerate(destinos)
            }
            for i, b in enumerate(bodegas)
        }

        # Función objetivo: minimizar el costo total
        prob += pulp.lpSum(
            rutas[b][d] * costos[b][d]
            for b in bodegas
            for d in destinos
        ), "Costo_Total"

        # Restricciones de oferta: no enviar más de lo disponible
        for i, b in enumerate(bodegas):
            prob += (
                pulp.lpSum(rutas[b][d] for d in destinos) <= oferta[b],
                f"Oferta_{i}",
            )

        # Restricciones de demanda: cubrir cada pedido
        for j, d in enumerate(destinos):
            prob += (
                pulp.lpSum(rutas[b][d] for b in bodegas) == demanda[d],
                f"Demanda_{j}",
            )

        # Resolver el modelo con el solucionador disponible de PuLP
        prob.solve()

        estado = pulp.LpStatus.get(prob.status, "Desconocido")

        if estado == "Optimal":
            costo_total = pulp.value(prob.objective) or 0
            st.success(f"✅ Solución óptima encontrada. Costo total: Q {costo_total:,.2f}")

            resultados = []
            for b in bodegas:
                for d in destinos:
                    valor = rutas[b][d].varValue
                    cantidad = int(round(valor or 0))
                    if cantidad > 0:
                        costo_ruta = cantidad * costos[b][d]
                        resultados.append(
                            {
                                "Origen": b,
                                "Destino": d,
                                "Paquetes enviados": cantidad,
                                "Costo por paquete (Q)": costos[b][d],
                                "Costo de la ruta (Q)": costo_ruta,
                            }
                        )

            if resultados:
                df_resultados = pd.DataFrame(resultados)
                st.subheader("📊 Distribución óptima de envíos")
                st.dataframe(df_resultados, use_container_width=True, hide_index=True)

                resumen = (
                    df_resultados.groupby("Destino", as_index=False)
                    .agg(
                        **{
                            "Paquetes enviados": ("Paquetes enviados", "sum"),
                            "Costo total (Q)": ("Costo de la ruta (Q)", "sum"),
                        }
                    )
                )
                st.subheader("📍 Resumen por departamento")
                st.dataframe(resumen, use_container_width=True, hide_index=True)

                st.caption(
                    "Las bodegas pueden conservar inventario sin utilizar, porque la oferta "
                    "se modela como un límite máximo y no como una cantidad que deba agotarse."
                )
            else:
                st.info("La solución no requiere enviar paquetes con los datos actuales.")
        else:
            st.error(
                f"No se encontró una solución óptima. Estado del modelo: {estado}. "
                "Verifica que la oferta sea suficiente y que los datos sean correctos."
            )

    except Exception as error:
        st.error(f"Ocurrió un error al ejecutar la optimización: {error}")
        st.info(
            "Comprueba que las dependencias estén instaladas con: "
            "`python -m pip install --upgrade streamlit pandas pulp`"
        )
