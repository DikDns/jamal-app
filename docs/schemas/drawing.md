# Drawing

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
    Drawing:
      type: object
      properties:
        id:
          type: string
          format: uuid
          examples:
            - 123e4567-e89b-12d3-a456-426614174000
        name:
          type: string
          examples:
            - My Drawing
          nullable: true
        store:
          type: object
          description: JSONB object containing tldraw store data
          x-apidog-orders: []
          examples:
            - schemaVersion: 1
              records: {}
        created_at:
          type: string
          format: date-time
        updated_at:
          type: string
          format: date-time
      x-apidog-orders:
        - id
        - name
        - store
        - created_at
        - updated_at
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