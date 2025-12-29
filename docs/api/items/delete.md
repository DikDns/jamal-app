# Delete item

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /items/{id}:
    delete:
      summary: Delete item
      deprecated: false
      description: ''
      tags:
        - Items
        - Items
      parameters:
        - name: id
          in: path
          description: ''
          required: true
          example: 0
          schema:
            type: integer
      responses:
        '200':
          description: Item deleted successfully
          headers: {}
          x-apidog-name: OK
        '404':
          description: Item not found
          headers: {}
          x-apidog-name: Not Found
      security:
        - apikey-header-apiKey: []
      x-apidog-folder: Items
      x-apidog-status: released
      x-run-in-apidog: https://app.apidog.com/web/project/1142423/apis/api-25032429-run
components:
  schemas: {}
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