import streamlit as st
import pandas as pd
import re

# 1. La misma función lógica (sin SQL)
def analizador_lexico(codigo_fuente):
    reglas = [
        ('RESERVADA',   r'\b(int|float|if|else|while|return)\b'),
        ('ID',          r'[a-zA-Z_]\w*'),
        ('NUMERO',      r'\d+(\.\d+)?'),
        ('ASIGNACION',  r'='),
        ('OPERADOR',    r'[+\-*/]'),
        ('DELIMITADOR', r'[;(){}\[\]]'),
        ('ESPACIO',     r'\s+'),
        ('DESCONOCIDO', r'.')
    ]
    
    patron_combinado = '|'.join(f'(?P<{nombre}>{patron})' for nombre, patron in reglas)
    tokens_generados = []
    
    for coincidencia in re.finditer(patron_combinado, codigo_fuente):
        tipo = coincidencia.lastgroup
        lexema = coincidencia.group()
        if tipo == 'ESPACIO': continue
        if tipo == 'DESCONOCIDO': return [{"Tipo": "Error Léxico", "Lexema": lexema}]
        tokens_generados.append({"Tipo": tipo, "Lexema": lexema})
        
    return tokens_generados

# 2. Interfaz Gráfica con Streamlit
st.title("Analizador Léxico - Compiladores")
st.write("Escribe tu código fuente en C++ o Python para generar los tokens.")

# Caja de texto para el usuario
codigo_usuario = st.text_area("Código Fuente:", height=150, value="int contador = 10;")

# Botón de acción
if st.button("Analizar Código"):
    if codigo_usuario.strip():
        # Llamamos a la función
        lista_tokens = analizador_lexico(codigo_usuario)
        
        # Convertimos la lista de diccionarios en un DataFrame de Pandas para que se vea como tabla
        df_tokens = pd.DataFrame(lista_tokens)
        
        st.success("Análisis completado")
        st.dataframe(df_tokens, use_container_width=True)
    else:
        st.warning("Por favor, ingresa algo de código.")