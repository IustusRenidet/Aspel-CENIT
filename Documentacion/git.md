
## 1. Estructura básica recomendada

```
<tipo>(<scope opcional>): <mensaje corto y claro>
```

**Ejemplo**

```
fix(auth): corrige validación de token expirado
```

---

## 2. Tipos de commit más usados

### Cambios de código

| Tipo               | Cuándo usarlo                            |
| ------------------ | ----------------------------------------- |
| **feat**     | Nueva funcionalidad                       |
| **fix**      | Corrección de bug                        |
| **refactor** | Cambio interno sin afectar comportamiento |
| **perf**     | Mejora de rendimiento                     |
| **style**    | Formato, espacios, lint (no lógica)      |
| **test**     | Agregar o corregir tests                  |
| **docs**     | Documentación                            |
| **build**    | Build system, dependencias                |
| **ci**       | Cambios en CI/CD                          |
| **chore**    | Tareas generales (no producto)            |

---

---

## 3. Usar `scope` (MUY recomendado en proyectos grandes)

El `scope` indica  **qué parte del sistema toca el commit** .

Ejemplos adaptados a tu tipo de proyectos:

```
fix(firebird): maneja tipo BLOB correctamente
feat(auth): agrega roles por división
refactor(sql): optimiza acumulado mensual
perf(cache): reduce lecturas a Firebird
```

Scopes típicos:

* `auth`
* `firebird`
* `sqlite`
* `etl`
* `ui`
* `api`
* `build`
* `electron`
* `cache`
