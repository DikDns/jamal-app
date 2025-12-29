# CreateItemDto

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
    CreateItemDto:
      type: object
      required:
        - name
      properties:
        name:
          type: string
          examples:
            - New Item
        description:
          type: string
          examples:
            - Optional description
      x-apidog-orders:
        - name
        - description
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