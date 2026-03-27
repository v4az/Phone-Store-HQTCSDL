FROM mcr.microsoft.com/mssql/server:2022-latest

COPY migrations/ /migrations/
COPY init-db.sh /init-db.sh

USER root
RUN chmod +x /init-db.sh
USER mssql

CMD /bin/bash -c '/opt/mssql/bin/sqlservr & /init-db.sh && wait'
