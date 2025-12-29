# Item

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
    Item:
      type: object
      properties:
        id:
          type: integer
          examples:
            - 1
        name:
          type: string
          examples:
            - Item A
        description:
          type: string
          examples:
            - Description of Item A
          nullable: true
        created_at:
          type: string
          format: date-time
      x-apidog-orders:
        - id
        - name
        - description
        - created_at
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