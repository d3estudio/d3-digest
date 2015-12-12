systems({
    'web': {
        depends: ['db', 'memcached'],
        image: {'docker': 'azukiapp/node:5'},
        provision: [
            'npm install'
        ],
        workdir: '/azk/#{manifest.dir}',
        shell: '/bin/bash',
        command: "node --use_strict src/web/main.js",
        wait: 20,
        mounts: {
            '/azk/#{manifest.dir}': sync('.'),
            '/azk/#{manifest.dir}/node_modules': persistent('./node_modules'),
        },
        scalable: {'default': 1},
        http: {
            domains: ['#{manifest.dir}-#{system.name}.#{azk.default_domain}']
        },
        ports: {
            http: '2708/tcp'
        },
        envs: {
            NODE_ENV: 'dev',
            PORT: '2708',
        },
    },
    'watch': {
        depends: ['db'],
        image: {'docker': 'azukiapp/node:5'},
        provision: [
            'npm install'
        ],
        workdir: '/azk/#{manifest.dir}',
        shell: '/bin/bash',
        command: "node --use_strict src/watcher/main.js",
        wait: 20,
        mounts: {
            '/azk/#{manifest.dir}': sync('.'),
            '/azk/#{manifest.dir}/node_modules': persistent('./node_modules'),
        },
        scalable: {'default': 1},
        envs: {
            NODE_ENV: 'dev',
        },
    },
    'db': {
        image: {'docker': 'azukiapp/mongodb'},
        scalable: false,
        wait: {'retry': 20, 'timeout': 1000},
        mounts: {
            '/data/db': persistent('mongodb-#{manifest.dir}'),
        },
        ports: {
            http: '28017:28017/tcp',
        },
        http: {
            domains: ['#{manifest.dir}-#{system.name}.#{azk.default_domain}'],
        },
        export_envs: {
            MONGODB_URI: 'mongodb://#{net.host}:#{net.port[27017]}/#{manifest.dir}_development'
        },
    },
    'memcached': {
        image: {'docker': 'memcached'},
        scalable: false,
        wait: {'retry': 20, 'timeout': 1000},
        ports: {
            http: '11211:11211/tcp'
        },
        http: {
            domains: ['#{manifest.dir}-#{system.name}.#{azk.default_domain}']
        },
        export_envs: {
            MEMCACHED_HOST: '#{net.host}',
            MEMCACHED_PORT: '#{net.port[11211]}'
        }
    }
});
