# CreateDrawingDto

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
    CreateDrawingDto:
      type: object
      required:
        - store
      properties:
        name:
          type: string
          examples:
            - New Drawing
        store:
          type: object
          x-apidog-orders: []
          examples:
            - schemaVersion: 1
              records: {}
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