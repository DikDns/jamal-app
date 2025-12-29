# Get all items

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /items:
    get:
      summary: Get all items
      deprecated: false
      description: ''
      tags:
        - Items
        - Items
      parameters: []
      responses:
        '200':
          description: List of items
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/Item'
          headers: {}
          x-apidog-name: OK
      security:
        - apikey-header-apiKey: []
      x-apidog-folder: Items
      x-apidog-status: released
      x-run-in-apidog: https://app.apidog.com/web/project/1142423/apis/api-25032425-run
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
      x-apidog-ignore-properties: []
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