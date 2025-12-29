# UpdateDrawingDto

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths: {}
components:
  schemas:
    UpdateDrawingDto:
      type: object
      properties:
        name:
          type: string
        store:
          type: object
          x-apidog-orders: []
      x-apidog-orders:
        - name
        - store
      x-apidog-folder: ''
  securitySchemes:
    apikey-header-apiKey:
      type: apiKey
      in: header
      name: apiKey
servers:
  - url: https://api.jamal.rplupiproject.com
    description: Prod Env
security:
  - apikey-header-apiKey: []

```