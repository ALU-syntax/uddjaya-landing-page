import * as THREE from 'https://esm.sh/three@0.150.1';
import {
    FontLoader
} from 'https://esm.sh/three@0.150.1/examples/jsm/loaders/FontLoader.js';

const FONT_URL = 'https://res.cloudinary.com/dydre7amr/raw/upload/v1612950355/font_zsd4dr.json';
const PARTICLE_TEXTURE_URL = 'https://res.cloudinary.com/dfvtkoboz/image/upload/v1605013866/particle_a64uzf.png';
const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const IS_SMALL_SCREEN = window.innerWidth < 768;

const VERTEX_SHADER = `
attribute float size;
attribute vec3 customColor;
varying vec3 vColor;

void main() {
  vColor = customColor;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * (300.0 / -mvPosition.z);
  gl_Position = projectionMatrix * mvPosition;
}
`;

const FRAGMENT_SHADER = `
uniform vec3 color;
uniform sampler2D pointTexture;

varying vec3 vColor;

void main() {
  gl_FragColor = vec4(color * vColor, 1.0);
  gl_FragColor = gl_FragColor * texture2D(pointTexture, gl_PointCoord);
}
`;

let environment = null;

function getTextEffectLabel() {
    const customText = document.querySelector('#magic')?.dataset.text;

    return customText || 'COMING\n  SOON!';
}

function initParticlesBackground() {
    if (!window.particlesJS || REDUCED_MOTION) {
        return;
    }

    window.particlesJS('particles-js', {
        particles: {
            number: {
                value: 80,
                density: {
                    enable: true,
                    value_area: 800
                }
            },
            color: {
                value: "#ffffff"
            },
            shape: {
                type: "circle",
                stroke: {
                    width: 0,
                    color: "#000000"
                },
                polygon: {
                    nb_sides: 5
                },
                image: {
                    src: "img/github.svg",
                    width: 100,
                    height: 100
                }
            },
            opacity: {
                value: 0.5,
                random: false,
                anim: {
                    enable: false,
                    speed: 1,
                    opacity_min: 0.1,
                    sync: false
                }
            },
            size: {
                value: 5,
                random: true,
                anim: {
                    enable: false,
                    speed: 40,
                    size_min: 0.1,
                    sync: false
                }
            },
            line_linked: {
                enable: true,
                distance: 150,
                color: "#ffffff",
                opacity: 0.4,
                width: 1
            },
            move: {
                enable: true,
                speed: 6,
                direction: "none",
                random: false,
                straight: false,
                out_mode: "out",
                attract: {
                    enable: false,
                    rotateX: 600,
                    rotateY: 1200
                }
            }
        },
        interactivity: {
            detect_on: "canvas",
            events: {
                onhover: {
                    enable: true,
                    mode: "repulse"
                },
                onclick: {
                    enable: true,
                    mode: "push"
                },
                resize: true
            },
            modes: {
                grab: {
                    distance: 400,
                    line_linked: {
                        opacity: 1
                    }
                },
                bubble: {
                    distance: 400,
                    size: 40,
                    duration: 2,
                    opacity: 8,
                    speed: 3
                },
                repulse: {
                    distance: 200
                },
                push: {
                    particles_nb: 4
                },
                remove: {
                    particles_nb: 2
                }
            }
        },
        retina_detect: true,
        config_demo: {
            hide_card: false,
            background_color: "#b61924",
            background_image: "",
            background_position: "50% 50%",
            background_repeat: "no-repeat",
            background_size: "cover"
        }
    });
}

function preloadTextEffect() {
    const manager = new THREE.LoadingManager();
    let typo = null;
    let particle = null;

    manager.onLoad = () => {
        environment = new Environment(typo, particle);
    };

    const loader = new FontLoader(manager);
    loader.load(FONT_URL, (font) => {
        typo = font;
    });

    particle = new THREE.TextureLoader(manager).load(PARTICLE_TEXTURE_URL);
}

function initPage() {
    initParticlesBackground();

    if (!REDUCED_MOTION) {
        preloadTextEffect();
    }
}

if (document.readyState === 'complete' || document.readyState === 'interactive') {
    initPage();
} else {
    document.addEventListener('DOMContentLoaded', initPage);
}

window.addEventListener('resize', () => {
    if (environment?.createParticles) {
        environment.createParticles.updateScaleBasedOnWindowSize();
    }
});

class Environment {
    constructor(font, particle) {
        this.font = font;
        this.particle = particle;
        this.container = document.querySelector('#magic');
        this.scene = new THREE.Scene();
        this.renderer = null;
        this.lastRenderTime = 0;
        this.frameInterval = 1000 / 30;

        this.createCamera();
        this.createRenderer();
        this.setup();
        this.bindEvents();
        this.onWindowResize();
    }

    bindEvents() {
        window.addEventListener('resize', this.onWindowResize.bind(this));
    }

    setup() {
        this.createParticles = new CreateParticles(
            this.scene,
            this.font,
            this.particle,
            this.camera,
            this.renderer,
        );
    }

    render() {
        this.createParticles.render();
        this.renderer.render(this.scene, this.camera);
    }

    createCamera() {
        this.camera = new THREE.PerspectiveCamera(
            65,
            this.container.clientWidth / this.container.clientHeight,
            1,
            10000,
        );
        this.camera.position.set(0, 0, 100);
    }

    createRenderer() {
        this.renderer = new THREE.WebGLRenderer({
            antialias: false,
            alpha: true,
            powerPreference: 'high-performance',
        });
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.setClearColor(0x000000, 0);
        this.container.appendChild(this.renderer.domElement);

        this.renderer.setAnimationLoop((time) => {
            if (time - this.lastRenderTime < this.frameInterval) {
                return;
            }

            this.lastRenderTime = time;
            this.render();
        });
    }

    onWindowResize() {
        this.camera.aspect = this.container.clientWidth / this.container.clientHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);

        this.camera.position.z = this.container.clientWidth < 500 ? 150 : 100;
    }
}

class CreateParticles {
    constructor(scene, font, particleImg, camera, renderer) {
        this.scene = scene;
        this.font = font;
        this.particleImg = particleImg;
        this.camera = camera;
        this.renderer = renderer;

        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2(-200, 200);
        this.colorChange = new THREE.Color();
        this.button = false;

        this.data = {
            text: getTextEffectLabel(),
            amount: IS_SMALL_SCREEN ? 80 : 180,
            particleSize: 1,
            particleColor: 0xc83d3b,
            textSize: 16,
            area: IS_SMALL_SCREEN ? 160 : 220,
            ease: 0.05,
        };

        this.setup();
        this.bindEvents();
        this.updateScaleBasedOnWindowSize();
    }

    setup() {
        const geometry = new THREE.PlaneGeometry(
            this.visibleWidthAtZDepth(100, this.camera),
            this.visibleHeightAtZDepth(100, this.camera),
        );
        const material = new THREE.MeshBasicMaterial({
            color: 0xc83d3b,
            transparent: true,
        });
        this.planeArea = new THREE.Mesh(geometry, material);
        this.planeArea.visible = false;
        this.createText();
    }

    bindEvents() {
        document.addEventListener('mousedown', this.onMouseDown.bind(this));
        document.addEventListener('mousemove', this.onMouseMove.bind(this));
        document.addEventListener('mouseup', this.onMouseUp.bind(this));
    }

    onMouseDown(event) {
        this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

        const vector = new THREE.Vector3(this.mouse.x, this.mouse.y, 0.5);
        vector.unproject(this.camera);
        const dir = vector.sub(this.camera.position).normalize();
        const distance = -this.camera.position.z / dir.z;
        this.currentPosition = this.camera.position.clone().add(dir.multiplyScalar(distance));

        this.button = true;
        this.data.ease = 0.01;
    }

    onMouseUp() {
        this.button = false;
        this.data.ease = 0.05;
    }

    onMouseMove(event) {
        this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    }

    render() {
        const time = ((0.001 * performance.now()) % 12) / 12;
        const zigzagTime = (1 + Math.sin(time * 2 * Math.PI)) / 6;

        this.raycaster.setFromCamera(this.mouse, this.camera);

        const intersects = this.raycaster.intersectObject(this.planeArea);

        if (intersects.length === 0) {
            return;
        }

        const pos = this.particles.geometry.attributes.position;
        const copy = this.geometryCopy.attributes.position;
        const colors = this.particles.geometry.attributes.customColor;
        const size = this.particles.geometry.attributes.size;
        const posArray = pos.array;
        const copyArray = copy.array;
        const colorArray = colors.array;
        const sizeArray = size.array;

        const mx = intersects[0].point.x;
        const my = intersects[0].point.y;
        const areaSq = this.data.area * this.data.area;
        const particleSize = this.data.particleSize;

        this.colorChange.setHSL(0.5, 1, 1);
        const baseR = this.colorChange.r;
        const baseG = this.colorChange.g;
        const baseB = this.colorChange.b;

        this.colorChange.setHSL(0.15, 1.0, 0.5);
        const warmR = this.colorChange.r;
        const warmG = this.colorChange.g;
        const warmB = this.colorChange.b;

        this.colorChange.setHSL(0.5 + zigzagTime, 1.0, 0.5);
        const activeR = this.colorChange.r;
        const activeG = this.colorChange.g;
        const activeB = this.colorChange.b;

        for (let i = 0, particleIndex = 0, l = posArray.length; i < l; i += 3, particleIndex += 1) {
            const initX = copyArray[i];
            const initY = copyArray[i + 1];
            const initZ = copyArray[i + 2];

            let px = posArray[i];
            let py = posArray[i + 1];
            let pz = posArray[i + 2];

            colorArray[i] = baseR;
            colorArray[i + 1] = baseG;
            colorArray[i + 2] = baseB;
            sizeArray[particleIndex] = particleSize;

            let dx = mx - px;
            let dy = my - py;
            const d = dx * dx + dy * dy;
            const f = d > 0.001 ? -this.data.area / d : 0;

            if (this.button) {
                const t = Math.atan2(dy, dx);
                px -= f * Math.cos(t);
                py -= f * Math.sin(t);

                colorArray[i] = activeR;
                colorArray[i + 1] = activeG;
                colorArray[i + 2] = activeB;

                if (px > initX + 70 || px < initX - 70 || py > initY + 70 || py < initY - 70) {
                    colorArray[i] = warmR;
                    colorArray[i + 1] = warmG;
                    colorArray[i + 2] = warmB;
                }
            } else if (d < areaSq) {
                const t = Math.atan2(dy, dx);

                if (particleIndex % 5 === 0) {
                    px -= 0.03 * Math.cos(t);
                    py -= 0.03 * Math.sin(t);

                    colorArray[i] = warmR;
                    colorArray[i + 1] = warmG;
                    colorArray[i + 2] = warmB;

                    sizeArray[particleIndex] = particleSize / 1.2;
                } else {
                    px += f * Math.cos(t);
                    py += f * Math.sin(t);

                    sizeArray[particleIndex] = particleSize * 1.3;
                }

                if (px > initX + 10 || px < initX - 10 || py > initY + 10 || py < initY - 10) {
                    colorArray[i] = warmR;
                    colorArray[i + 1] = warmG;
                    colorArray[i + 2] = warmB;

                    sizeArray[particleIndex] = particleSize / 1.8;
                }
            }

            dx = initX - px;
            dy = initY - py;

            px += dx * this.data.ease;
            py += dy * this.data.ease;
            pz += (initZ - pz) * this.data.ease;

            posArray[i] = px;
            posArray[i + 1] = py;
            posArray[i + 2] = pz;
        }

        pos.needsUpdate = true;
        colors.needsUpdate = true;
        size.needsUpdate = true;
    }

    createText() {
        const points = [];
        const shapes = this.font.generateShapes(this.data.text, this.data.textSize);
        const geometry = new THREE.ShapeGeometry(shapes);
        geometry.computeBoundingBox();

        const xMid = -0.5 * (geometry.boundingBox.max.x - geometry.boundingBox.min.x);
        const yMid = (geometry.boundingBox.max.y - geometry.boundingBox.min.y) / 2.85;

        geometry.center();

        const holeShapes = [];

        for (let q = 0; q < shapes.length; q += 1) {
            const shape = shapes[q];

            if (shape.holes && shape.holes.length > 0) {
                for (let j = 0; j < shape.holes.length; j += 1) {
                    holeShapes.push(shape.holes[j]);
                }
            }
        }

        shapes.push(...holeShapes);

        const colors = [];
        const sizes = [];

        for (let x = 0; x < shapes.length; x += 1) {
            const shape = shapes[x];
            const amountPoints = shape.type === 'Path' ? this.data.amount / 2 : this.data.amount;

            shape.getSpacedPoints(amountPoints).forEach((element) => {
                points.push(new THREE.Vector3(element.x, element.y, 0));
                colors.push(this.colorChange.r, this.colorChange.g, this.colorChange.b);
                sizes.push(1);
            });
        }

        const geoParticles = new THREE.BufferGeometry().setFromPoints(points);
        geoParticles.translate(xMid, yMid, 0);

        geoParticles.setAttribute('customColor', new THREE.Float32BufferAttribute(colors, 3));
        geoParticles.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 1));

        const material = new THREE.ShaderMaterial({
            uniforms: {
                color: {
                    value: new THREE.Color(0xffffff),
                },
                pointTexture: {
                    value: this.particleImg,
                },
            },
            vertexShader: VERTEX_SHADER,
            fragmentShader: FRAGMENT_SHADER,
            blending: THREE.AdditiveBlending,
            depthTest: false,
            transparent: true,
        });

        this.particles = new THREE.Points(geoParticles, material);
        this.scene.add(this.particles);

        this.geometryCopy = new THREE.BufferGeometry();
        this.geometryCopy.copy(this.particles.geometry);
    }

    visibleHeightAtZDepth(depth, camera) {
        let resolvedDepth = depth;
        const cameraOffset = camera.position.z;

        if (resolvedDepth < cameraOffset) {
            resolvedDepth -= cameraOffset;
        } else {
            resolvedDepth += cameraOffset;
        }

        const vFOV = camera.fov * Math.PI / 180;

        return 2 * Math.tan(vFOV / 2) * Math.abs(resolvedDepth);
    }

    visibleWidthAtZDepth(depth, camera) {
        const height = this.visibleHeightAtZDepth(depth, camera);
        return height * camera.aspect;
    }

    updateScaleBasedOnWindowSize() {
        const width = window.innerWidth;

        if (width < 480) {
            this.particles.scale.set(0.4, 0.4, 0.4);
        } else if (width < 768) {
            this.particles.scale.set(0.75, 0.75, 0.75);
        } else {
            this.particles.scale.set(1, 1, 1);
        }
    }
}
