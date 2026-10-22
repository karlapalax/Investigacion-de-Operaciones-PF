class SimplexBigM {
    constructor(variables, constraints) {
        this.M = 10000; // La Gran M
        this.vars = variables; // {name, cost}
        this.constraints = constraints; // {coeffs[], type, rhs}
        this.tableau = [];
        this.headers = [];
        this.basis = [];
        this.iterations = [];
        this.numVars = variables.length;
        this.artificialCount = 0;
        this.slackCount = 0;
    }

    buildInitialTableau() {
        let headers = this.vars.map(v => v.name);
        let Cj = this.vars.map(v => v.cost);
        let matrix = [];
        let basisIndices = [];

        // Agregar holguras y artificiales
        this.constraints.forEach((c, i) => {
            let row = [...c.coeffs];
            
            if (c.type === '<=') {
                this.slackCount++;
                let sName = `S${this.slackCount}`;
                headers.push(sName);
                Cj.push(0); // Costo 0 para holgura
                
                // Rellenar ceros en filas anteriores
                matrix.forEach(r => r.push(0));
                row.push(1);
                basisIndices.push(headers.length - 1);
            } 
            else if (c.type === '=') {
                this.artificialCount++;
                let aName = `A${this.artificialCount}`;
                headers.push(aName);
                Cj.push(this.M); // Costo M para artificial en Minimización
                
                matrix.forEach(r => r.push(0));
                row.push(1);
                basisIndices.push(headers.length - 1);
            }
            matrix.push(row);
        });

        // Asegurar que todas las filas tengan la misma longitud
        let totalCols = headers.length;
        matrix.forEach(r => { while(r.length < totalCols) r.push(0); });
        
        // Agregar RHS (columna de solución)
        headers.push('RHS');
        matrix.forEach((r, i) => r.push(this.constraints[i].rhs));
        Cj.push(0); 

        this.headers = headers;
        this.Cj = Cj;
        this.matrix = matrix;
        this.basis = basisIndices;

        this.calculateZjCj();
        this.saveIteration("Tabla Inicial");
    }

    calculateZjCj() {
        let zRow = new Array(this.headers.length).fill(0);
        let currentZ = 0;

        for (let col = 0; col < this.headers.length - 1; col++) {
            let zj = 0;
            for (let row = 0; row < this.matrix.length; row++) {
                let basisVarIndex = this.basis[row];
                let costCB = this.Cj[basisVarIndex];
                zj += costCB * this.matrix[row][col];
            }
            // Zj - Cj (Para minimizar, buscamos el valor más positivo para entrar)
            zRow[col] = zj - this.Cj[col]; 
        }

        // Calcular Z actual (Costo)
        for (let row = 0; row < this.matrix.length; row++) {
            currentZ += this.Cj[this.basis[row]] * this.matrix[row][this.headers.length - 1];
        }
        zRow[this.headers.length - 1] = currentZ;
        this.zRow = zRow;
    }

    getEnteringVariable() {
        // En Minimización, entra la variable con Zj - Cj más POSITIVO
        let maxVal = 0.0001; // Tolerancia para punto flotante
        let enteringCol = -1;
        for (let i = 0; i < this.headers.length - 1; i++) {
            if (this.zRow[i] > maxVal) {
                maxVal = this.zRow[i];
                enteringCol = i;
            }
        }
        return enteringCol;
    }

    getLeavingVariable(enteringCol) {
        let minRatio = Infinity;
        let leavingRow = -1;
        let rhsCol = this.headers.length - 1;

        for (let i = 0; i < this.matrix.length; i++) {
            let val = this.matrix[i][enteringCol];
            if (val > 0.0001) {
                let ratio = this.matrix[i][rhsCol] / val;
                if (ratio < minRatio) {
                    minRatio = ratio;
                    leavingRow = i;
                }
            }
        }
        return leavingRow;
    }

    pivot(enteringCol, leavingRow) {
        let pivotValue = this.matrix[leavingRow][enteringCol];
        let cols = this.headers.length;

        // Dividir la fila saliente entre el pivote
        for (let j = 0; j < cols; j++) {
            this.matrix[leavingRow][j] /= pivotValue;
        }

        // Hacer ceros en el resto de la columna
        for (let i = 0; i < this.matrix.length; i++) {
            if (i !== leavingRow) {
                let factor = this.matrix[i][enteringCol];
                for (let j = 0; j < cols; j++) {
                    this.matrix[i][j] -= factor * this.matrix[leavingRow][j];
                }
            }
        }

        // Actualizar variable básica
        this.basis[leavingRow] = enteringCol;
        this.calculateZjCj();
    }

    saveIteration(title, enteringCol = -1, leavingRow = -1) {
        // Clona el estado actual para mostrarlo en la UI
        this.iterations.push({
            title: title,
            headers: [...this.headers],
            Cj: [...this.Cj],
            basisNames: this.basis.map(i => this.headers[i]),
            matrix: this.matrix.map(row => [...row]),
            zRow: [...this.zRow],
            enteringCol: enteringCol,
            leavingRow: leavingRow,
            zValue: this.zRow[this.zRow.length - 1]
        });
    }

    solve() {
        this.buildInitialTableau();
        let maxIterations = 20;
        let iter = 1;

        while (iter <= maxIterations) {
            let enteringCol = this.getEnteringVariable();
            if (enteringCol === -1) {
                this.saveIteration(`Solución Óptima Encontrada`);
                break; // Llegamos al óptimo
            }

            let leavingRow = this.getLeavingVariable(enteringCol);
            if (leavingRow === -1) {
                throw new Error("Problema No Acotado: La columna entrante no tiene denominadores positivos.");
            }

            // Marcar celda pivote en la iteración actual
            let currentIterIndex = this.iterations.length - 1;
            this.iterations[currentIterIndex].enteringCol = enteringCol;
            this.iterations[currentIterIndex].leavingRow = leavingRow;

            // Identificar qué variable entra y cuál sale ANTES de hacer el pivote
            let variableEntrante = this.headers[enteringCol];
            let variableSaliente = this.iterations[currentIterIndex].basisNames[leavingRow];

            // Ejecutar operaciones de renglón (Gauss-Jordan)
            this.pivot(enteringCol, leavingRow);
            
            // Guardar la nueva tabla resultante
            this.saveIteration(`Iteración ${iter} (Entra ${variableEntrante}, Sale ${variableSaliente})`);
            iter++;
        }

        return this.verifySolution();
    }

    verifySolution() {
        // Revisar si quedaron variables artificiales en la base con valor > 0
        let isFeasible = true;
        let solution = {};
        let totalZ = this.zRow[this.headers.length - 1];

        for(let i=0; i<this.basis.length; i++) {
            let varName = this.headers[this.basis[i]];
            let val = this.matrix[i][this.headers.length - 1];
            if (varName.startsWith('A') && val > 0.001) {
                isFeasible = false; // Inviable
            }
            solution[varName] = val;
        }

        return {
            feasible: isFeasible,
            iterations: this.iterations,
            solution: solution,
            z: totalZ
        };
    }
}